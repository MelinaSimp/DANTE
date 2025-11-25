import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("content-type", "text/plain");
  res.status(200).send("ok");
}
