import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';

class QuotexChartAPI {
    ws: WebSocket | null = null;
    token: string | null = null;
    candles: any[] = [];
    wsUrl = 'wss://qt.proxquotex.com/root';
    emitToClients: (candle: any) => void = () => {};

    async getToken() {
        try {
            const response = await axios.post('https://qt.proxquotex.com/api/v1/auth/login', {
                userLogin: 'demo',
                password: 'demo'
            });
            this.token = response.data.token;
            console.log('✅ Token:', this.token?.substring(0, 20) + '...');
            return this.token;
        } catch (error: any) {
            console.error('❌ Token Error:', error.message);
        }
    }

    connect(pair = 'EURUSD-OTC') {
        return new Promise((resolve, reject) => {
            if (this.ws) {
                this.ws.close();
            }
            this.candles = [];
            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', () => {
                console.log('🔗 WS Connected');
                
                this.ws?.send(JSON.stringify({
                    authorization: this.token,
                    action: 'authorization'
                }));

                setTimeout(() => {
                    this.subscribeChart(pair);
                    resolve('Connected');
                }, 1000);
            });

            this.ws.on('message', (data: any) => {
                const msg = JSON.parse(data.toString());
                this.handleMessage(msg);
            });

            this.ws.on('close', () => {
                console.log('❌ WS Closed');
            });
        });
    }

    subscribeChart(pair: string, timeframe = 60) {
        const subscribeMsg = {
            action: 'chart/subscribe',
            payload: {
                asset: pair,
                timeframe: timeframe,
                style: 'candles'
            }
        };
        this.ws?.send(JSON.stringify(subscribeMsg));
        console.log(`📊 Subscribed: ${pair} ${timeframe}s`);
    }

    handleMessage(msg: any) {
        if (msg.action === 'authorization' && msg.status === 'ok') {
            console.log('✅ Auth OK');
        }

        if (msg.action === 'chart/candle' && msg.data) {
            const candle = {
                time: msg.data.time,
                open: parseFloat(msg.data.open),
                high: parseFloat(msg.data.high),
                low: parseFloat(msg.data.low),
                close: parseFloat(msg.data.close)
            };

            this.candles.unshift(candle);
            if (this.candles.length > 100) this.candles.pop();

            console.log(`🕯️  ${new Date(candle.time * 1000).toLocaleTimeString()} | O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}`);
            
            this.emitToClients(candle);
        }
    }
}

async function startServer() {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, { cors: { origin: '*' } });
    const PORT = 3000;

    const quotex = new QuotexChartAPI();

    quotex.emitToClients = (candle) => {
        io.emit('live-candle', candle);
    };

    io.on('connection', (socket) => {
        console.log('👤 Client Connected');
        socket.emit('historical', quotex.candles.slice(0, 50));
        
        socket.on('subscribe', async (pair) => {
            await quotex.connect(pair);
            // Wait a bit for some candles to arrive, then emit historical
            setTimeout(() => {
                io.emit('historical', quotex.candles.slice(0, 50));
            }, 2000);
        });
    });

    await quotex.getToken();
    await quotex.connect('EURUSD-OTC');

    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        app.use(express.static('dist'));
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

startServer();
