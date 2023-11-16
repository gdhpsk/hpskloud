import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises"
import types from "../../../../types.json"
import prettyBytes from "pretty-bytes";
import dayjs from "dayjs";
import jwt from "jsonwebtoken"
import { authorized, transactions } from "../../../../mongodb";
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
    if(req.url == "/api/bucket/ping") {
        const size = await getFolderSize.loose(bucket as string)
        let total = 200 // in gigs
        return res.status(200).send({user, total, used: JSON.parse((size / 1000 / 1000 / 1000).toFixed(5))})
    }
    if (!req.query.path || !["dir", "file"].includes((req.query.path[0]))) return res.status(403).send({ error: "403 FORBIDDEN", message: "Could not find the URL and method provided." })
    if(req.method != "GET" && user !== "root") return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to perform the following command." })
    let valid = await authorized.exists({
        $expr: {
            $cond: {
                'if': {
                    $and: [{ $ne: ['$username', user] }, {
                        $ne: [{
                            $size: [{
                                $filter: {
                                    input: "$hasAccessTo",
                                    as: "item",
                                    cond: { $in: ["$$item", ["", ...(req.query.path as string[]).slice(1)].map((e, i, a) => a.slice(0, i+1).join("/") || "/")] }
                                }
                            }]
                        }, 0]
                    }]
                }, then: true, 'else': false
            }
        }
    })
    if (valid) return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to get the following route." })
    if ((req.query.path as string[])[0] == "dir") {
        (req.query.path as string[]).shift()
        switch (req.method) {
            case "GET":
                try {
                    let files: any[] = await fs.readdir(bucket as string + "/" + (req.query.path as string[]).join("/"))
                    files = files.map(async e => {
                        let stat = await fs.lstat(bucket as string + "/" + (req.query.path as string[]).join("/") + "/" + e)
                        let isDir = stat.isDirectory()
                        let viewable = await authorized.exists({
                            $expr: {
                                $cond: {
                                    'if': {
                                        $and: [{ $ne: ['$username', user] }, {
                                            $in: ["/" + e, "$hasAccessTo"]
                                        }]
                                    }, then: true, 'else': false
                                }
                            }
                        })
                        return {
                            name: !isDir ? e.split(".").slice(0, e.split(".").length-1).join(".") : e,
                            type: !isDir ? e.split(".").at(-1) : undefined,
                            isDir,
                            authorized: !!!viewable,
                            path: `${(req.query.path as string[]).length ? "/" : ""}` + (req.query.path as string[]).join("/") + "/" + e,
                            mime: !isDir ? (types as any)["." + e.split(".").at(-1)] || "application/octet-stream" : undefined,
                            size: prettyBytes(stat.size),
                            modified: dayjs(stat.birthtimeMs).format("MMMM DD, YYYY hh:mm:ss A")
                        }
                    })
                    files = await Promise.all(files)
                    files = files.filter(e => e.authorized)
                    files.sort((a, b) => b.isDir - a.isDir)
                    return res.status(200).send(files)
                } catch (e) {
                    return res.status(404).send({ error: "404 NOT FOUND", message: "Could not find the group requested" })
                }
            case "POST":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a group name to create!" })
                    await fs.mkdir(bucket as string + "/" + (req.query.path as string[]).join("/"))
                    return res.status(204).send(null)
                } catch (_) {
                    return res.status(400).send({ error: "400 BAD REQUEST", message: "That group already exists!" })
                }
            case "PATCH":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a group name to delete!" })
                    await fs.rename(bucket as string + "/" + (req.query.path as string[]).join("/"), bucket as string + "/" + (req.query.path as string[]).slice(0, (req.query.path as string[]).length-1).join("/") + "/" + req.body.newName)
                    return res.status(204).send(null)
                } catch (_) {
                    console.log(_)
                    return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to edit." })
                }
            case "DELETE":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a group name to delete!" })
                    await fs.rm(bucket as string + "/" + (req.query.path as string[]).join("/"), { recursive: true, force: true })
                    return res.status(204).send(null)
                } catch (_) {
                    return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                }
        }
    }

    if ((req.query.path as string[])[0] == "file") {
        (req.query.path as string[]).shift()
        switch (req.method) {
            case "GET":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a file name to view!" })
                    let stat = await fs.lstat(bucket as string + "/" + (req.query.path as string[]).join("/"))
                    if(stat.isDirectory()) throw new Error()
                    if (!req.query.download) {
                        res.setHeader("content-disposition", `inline;"`);
                        res.setHeader("accept-ranges", "bytes");
                        let str = "." + ((req.query.path as string[]).at(-1)?.split(".").at(-1) || "a")
                        res.setHeader("Content-Type", (types as any)[str]);
                    }
                    res.writeHead(200, {
                        'content-length': stat.size
                    })
                    const file = await fs.readFile(bucket as string + "/" + (req.query.path as string[]).join("/"))
                    const stream = new Readable()
                    stream._read = () => {}
                    for(let i = 0; i < file.length; i += 8000000) {
                        stream.push(file.subarray(i, i+8000000))
                    }
                    await new Promise((resolve, reject) => {
                        stream.pipe(res)
                        stream.on("end", resolve)
                    })
                    return res.end()
                } catch (_) {
                    return res.status(404).send({ error: "404 NOT FOUND", message: "Could not find the object requested" })
                }
            case "POST":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a file name to add!" })
                    if(req.body.length > 8000000) return res.json({error: "400 BAD REQUEST", message: "Max chunks allowed to be sent in are 16 MB!"})
                    let tExists = await transactions.findOne({path: "/" + (req.query.path as string[]).join("/")})
                    if(tExists) {
                        try {
                            await bcrypt.compare(req.headers["x-secret-token"] as any, tExists.cryptoKey as any)
                        } catch(_) {
                            return res.status(400).send({ error: "401 UNAUTHORIZED", message: "Not a valid token for said path." })
                        }
                        if(req.body == "END") {
                            await transactions.deleteOne({path: "/" + (req.query.path as string[]).join("/")})
                            return res.status(204).send(null)
                        }
                        try {
                            let buffer = Buffer.from(req.body);
                            await fs.appendFile(bucket as string + "/" + (req.query.path as string[]).join("/"), buffer)
                        } catch(_) {
                            return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                        }
                        return res.status(201).send(null)
                    }
                    let buffer = Buffer.from(req.body);
                    await fs.writeFile(bucket as string + "/" + (req.query.path as string[]).join("/"),  buffer).catch((e) => {
                        console.log(e)
                        return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                    })
                    let key = crypto.generateKeySync("hmac", {length: 32}).export().toString("hex")
                    let cryptoKey = await bcrypt.hash(key, 10)
                    await transactions.create({cryptoKey, path: "/" + (req.query.path as string[]).join("/")})
                    return res.status(201).send({key})
                } catch (e) {
                    console.log(e)
                    return res.status(400).send({ error: "400 BAD REQUEST", message: "Make sure your body is form data!" })
                }
            case "DELETE":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a file name to delete!" })
                    await fs.rm(bucket as string + "/" + (req.query.path as string[]).join("/"))
                    return res.status(204).send(null)
                } catch (_) {
                    return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                }
        }
    }
}

export const config = {
    api: {
      bodyParser: {
        sizeLimit: '100gb',
      },
      responseLimit: false
    },
  }