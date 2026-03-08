import mongoose from "mongoose";
import auth from "./schemas/authorized"
import transactionsSchema from "./schemas/transactions";
import mappingsSchema from "./schemas/mappings"

mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: "hpskloud",
    readPreference: "primaryPreferred",
    authSource: "$external",
    authMechanism: "MONGODB-X509",
    tls: true,
    tlsCAFile: process.env.CA_PATH,
    tlsCertificateKeyFile: process.env.CLIENT_PEM_PATH,
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — attempting reconnect');
});

mongoose.connection.on('error', (err: any) => {
  console.error('MongoDB connection error:', err);
});

export const authorized = auth
export const transactions = transactionsSchema
export const mappings = mappingsSchema