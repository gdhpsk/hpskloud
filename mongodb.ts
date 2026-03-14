import mongoose from "mongoose";
import auth from "./schemas/authorized"
import transactionsSchema from "./schemas/transactions";
import mappingsSchema from "./schemas/mappings"

mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: "hpskloud",
    readPreference: "primary",
    authSource: "$external",
    authMechanism: "MONGODB-X509",
    tlsCAFile: process.env.CA_PATH,
    tlsCertificateKeyFile: process.env.CLIENT_PEM_PATH,
} as any);

export const authorized = auth
export const transactions = transactionsSchema
export const mappings = mappingsSchema