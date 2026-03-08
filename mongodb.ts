import mongoose from "mongoose";
import auth from "./schemas/authorized"
import transactionsSchema from "./schemas/transactions";
import mappingsSchema from "./schemas/mappings"

mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: "hpskloud",
    readPreference: "primary",
    authSource: "$external",
    authMechanism: "MONGODB-X509",
    tlsCertificateKeyFile: process.env.keyPath,
} as any);

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — attempting reconnect');
});

mongoose.connection.on('error', (err: any) => {
  console.error('MongoDB connection error:', err);
});

export const authorized = auth
export const transactions = transactionsSchema
export const mappings = mappingsSchema