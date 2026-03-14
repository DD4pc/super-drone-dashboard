import { Server, Socket } from 'socket.io';
import { EncryptionService } from './encryption.service';
import http from 'http';

export class WebSocketService {
    private io: Server;
    private encryptionService: EncryptionService;
    private activeDrones: Map<string, any> = new Map();

    constructor(httpServer: http.Server) {
        this.io = new Server(httpServer, {
            cors: {
                origin: process.env.CLIENT_URL || 'http://localhost:3000',
                methods: ['GET', 'POST']
            }
        });
        this.encryptionService = new EncryptionService();
        this.setupListeners();
    }

    private setupListeners() {
        this.io.on('connection', (socket: Socket) => {
            const userId = socket.handshake.auth.userId;
            console.log(`User ${userId} connected`);

            socket.on('drone:connect', (droneId: string) => {
                this.activeDrones.set(droneId, socket.id);
                socket.emit('drone:status', { status: 'connected', droneId });
            });

            socket.on('telemetry:update', (encryptedData: string) => {
                try {
                    const decrypted = this.encryptionService.decryptTelemetry(encryptedData);
                    this.io.emit('telemetry:update', {
                        data: decrypted,
                        timestamp: Date.now(),
                        droneId: Array.from(this.activeDrones.entries())
                            .find(([_, id]) => id === socket.id)?.[0]
                    });
                } catch (error) {
                    socket.emit('error', { message: 'Invalid telemetry data' });
                }
            });

            socket.on('drone:disconnect', (droneId: string) => {
                this.activeDrones.delete(droneId);
                this.io.emit('drone:status', { status: 'disconnected', droneId });
            });

            socket.on('disconnect', () => {
                console.log(`User ${userId} disconnected`);
                this.activeDrones.forEach((id, droneId) => {
                    if (id === socket.id) this.activeDrones.delete(droneId);
                });
            });
        });
    }

    getIO(): Server {
        return this.io;
    }
}