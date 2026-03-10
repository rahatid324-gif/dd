import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';

export default function App() {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState('Disconnected');
    const [pair, setPair] = useState('EURUSD-OTC');
    const socketRef = useRef<Socket | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: { background: { color: '#0a0a0a' }, textColor: '#d1d4dc' },
            grid: { vertLines: { color: '#334158' }, horzLines: { color: '#334158' } },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
        });
        chartRef.current = chart;

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#00ff88', downColor: '#ff4444',
            borderVisible: false,
            wickUpColor: '#00ff88', wickDownColor: '#ff4444'
        });
        seriesRef.current = candleSeries;

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight,
                });
            }
        };
        window.addEventListener('resize', handleResize);

        const socket = io();
        socketRef.current = socket;

        socket.on('connect', () => {
            setStatus('Connected');
        });

        socket.on('historical', (data: any[]) => {
            // Data comes in newest first from the server, lightweight-charts needs oldest first
            const sortedData = [...data].sort((a, b) => a.time - b.time);
            const candles = sortedData.map(c => ({
                time: c.time,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close
            }));
            // @ts-ignore
            candleSeries.setData(candles);
        });

        socket.on('live-candle', (candle: any) => {
            // @ts-ignore
            candleSeries.update(candle);
            setStatus(`Live: ${new Date(candle.time * 1000).toLocaleTimeString()}`);
        });

        return () => {
            window.removeEventListener('resize', handleResize);
            socket.disconnect();
            chart.remove();
        };
    }, []);

    const subscribe = () => {
        if (socketRef.current) {
            socketRef.current.emit('subscribe', pair);
            setStatus(`Subscribed: ${pair}`);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
            <div className="absolute top-4 left-4 z-10 bg-black/80 p-4 rounded-xl border border-white/10 shadow-lg backdrop-blur-sm flex flex-col gap-3">
                <div className="font-bold text-lg tracking-tight">🔥 QUOTEX LIVE DATA</div>
                <div className="flex items-center gap-2">
                    <select 
                        value={pair}
                        onChange={(e) => setPair(e.target.value)}
                        className="bg-[#333] text-white border border-[#555] p-2 rounded-md outline-none focus:border-[#00ff88] transition-colors"
                    >
                        <option value="EURUSD-OTC">EURUSD-OTC</option>
                        <option value="GBPUSD-OTC">GBPUSD-OTC</option>
                        <option value="AUDUSD-OTC">AUDUSD-OTC</option>
                        <option value="USDJPY-OTC">USDJPY-OTC</option>
                    </select>
                    <button 
                        onClick={subscribe}
                        className="bg-[#333] hover:bg-[#444] text-white border border-[#555] px-4 py-2 rounded-md transition-colors cursor-pointer active:scale-95"
                    >
                        📡 Subscribe
                    </button>
                </div>
                <div className="text-[#00ff88] font-mono text-sm font-medium">
                    {status}
                </div>
            </div>
            <div ref={chartContainerRef} className="flex-1 w-full h-full" />
        </div>
    );
}
