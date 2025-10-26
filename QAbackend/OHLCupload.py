import io
import pandas as pd
from fastapi import UploadFile, File
from fastapi.responses import JSONResponse



@app.post("/api/upload/ohlc")
async def upload_ohlc_data(file: UploadFile = File(...)):
    """
    Upload historical OHLC CSV to bootstrap analytics
    
    CSV Format:
    timestamp,symbol,open,high,low,close,volume
    1729857045123,BTCUSDT,67500.0,67600.0,67400.0,67550.0,125.5
    """
    try:
        # Read and parse CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        # Validate columns
        required_cols = ['timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume']
        if not all(col in df.columns for col in required_cols):
            return JSONResponse(
                {"error": f"CSV must have columns: {required_cols}"},
                status_code=400
            )
        
        logger.info(f"📤 Uploading {len(df)} OHLC records from {file.filename}")
        
        # Insert candles into database
        inserted_candles = 0
        for _, row in df.iterrows():
            candle = OHLCVData(
                timestamp=float(row['timestamp']),
                symbol=str(row['symbol']).upper(),
                open=float(row['open']),
                high=float(row['high']),
                low=float(row['low']),
                close=float(row['close']),
                volume=float(row['volume'])
            )
            data_processor.db_manager.insert_candle(candle, timeframe='1m')
            inserted_candles += 1
        
        # Backfill tick buffers with synthetic ticks
        symbols_processed = set()
        inserted_ticks = 0
        
        for symbol in df['symbol'].unique():
            symbol = str(symbol).upper()
            symbols_processed.add(symbol)
            
            # Ensure tick buffer exists
            if symbol not in data_processor.tick_buffers:
                data_processor.tick_buffers[symbol] = TickBuffer()
                data_processor.active_symbols.add(symbol)
            
            # Convert OHLC to synthetic ticks (using close prices)
            symbol_df = df[df['symbol'] == symbol].sort_values('timestamp')
            for _, row in symbol_df.iterrows():
                tick = TickData(
                    timestamp=float(row['timestamp']),
                    symbol=symbol,
                    price=float(row['close']),
                    quantity=float(row['volume'])
                )
                data_processor.tick_buffers[symbol].add(tick)
                inserted_ticks += 1
        
        # Force immediate analytics computation
        await data_processor.compute_analytics()
        
        # Broadcast to all connected clients
        analytics = data_processor.get_latest_analytics()
        for client in connected_clients:
            try:
                await client.send_json({
                    "type": "upload_complete",
                    "analytics": analytics
                })
            except:
                pass
        
        logger.info(f"✅ Upload complete: {inserted_candles} candles, {inserted_ticks} ticks")
        
        return JSONResponse({
            "success": True,
            "candles_inserted": inserted_candles,
            "ticks_created": inserted_ticks,
            "symbols": list(symbols_processed),
            "message": f"Historical data loaded. All analytics now available!",
            "capabilities": analytics.get("capabilities", {})
        })
        
    except Exception as e:
        logger.error(f"❌ Upload error: {str(e)}", exc_info=True)
        return JSONResponse(
            {"error": str(e)}, 
            status_code=500
        )


@app.get("/api/export/template")
async def download_csv_template():
    """Download CSV template for OHLC upload"""
    template = """timestamp,symbol,open,high,low,close,volume
1729857045000,BTCUSDT,67500.00,67600.00,67400.00,67550.00,125.5
1729857105000,BTCUSDT,67550.00,67650.00,67500.00,67600.00,98.3
1729857165000,ETHUSDT,3500.00,3510.00,3495.00,3505.00,450.2
"""
    
    return JSONResponse({
        "template": template,
        "instructions": {
            "timestamp": "Unix timestamp in milliseconds",
            "symbol": "Trading pair (e.g., BTCUSDT)",
            "open": "Opening price for period",
            "high": "Highest price in period",
            "low": "Lowest price in period",
            "close": "Closing price for period",
            "volume": "Trading volume"
        }
    })