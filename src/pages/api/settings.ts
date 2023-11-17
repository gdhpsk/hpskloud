import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises"
import types from "../../../types.json"
import prettyBytes from "pretty-bytes";
import dayjs from "dayjs";
import jwt from "jsonwebtoken"
import { authorized, transactions } from "../../../mongodb";
import getFolderSize from "get-folder-size"
import { createReadStream, createWriteStream } from "fs";
import crypto from "crypto"
import bcrypt from "bcrypt"
import { Readable } from "stream";

let { bucket } = process.env


export default async function handler(req: NextApiRequest, res: NextApiResponse,) {
    let user = ""
    try {
        user = jwt.verify(req.cookies.token as string, process.env.jwtToken as string) as string
    } catch (_) { }
   if(user != "root") return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to use the following route." })
   switch (req.method) {
        case "GET":
            let settings = await authorized.find()
            return res.json(settings)
        case "PATCH":
            for(const item of req.body) {
                await authorized.updateOne({username: item.username}, {
                    $set: {
                        username: item.username,
                        hasAccessTo: item.hasAccessTo,
                        writeAccessTo: item.writeAccessTo
                    }
                }, {upsert: true})
            }
            let del = await authorized.find({username: {$nin: req.body.map((e:any) => e.username)}})
            for(const item of del) {
                await authorized.deleteOne({username: item.username})
            }
            return res.status(204).send(null)
        default:
            return res.status(404).send({ error: "403 FORBIDDEN", message: "This route is not allowed." })
    }
}