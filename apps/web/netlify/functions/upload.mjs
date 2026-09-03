/**
 * Pins an uploaded image to IPFS.
 *
 * This exists so the Pinata key never reaches a browser. The client sends the
 * file here, the server holds the credential, and what comes back is an ipfs://
 * URI that goes on chain with the launch.
 *
 * Requires PINATA_JWT in the Netlify environment. Without it the endpoint says
 * so plainly rather than failing in a way the interface has to guess about.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({error: "Send the image as a POST."}, 405);
  }

  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return json(
      {error: "Image uploads are not configured. PINATA_JWT is missing on the server."},
      501,
    );
  }

  let file;
  try {
    const form = await request.formData();
    file = form.get("file");
  } catch {
    return json({error: "That upload could not be read."}, 400);
  }

  if (!file || typeof file === "string") {
    return json({error: "No file was attached."}, 400);
  }
  if (!ALLOWED.has(file.type)) {
    return json({error: "Use a PNG, JPEG, GIF or WebP image."}, 415);
  }
  if (file.size > MAX_BYTES) {
    return json({error: "That image is over 5 MB. Use a smaller one."}, 413);
  }

  const body = new FormData();
  body.append("file", file, file.name || "image");
  body.append("pinataOptions", JSON.stringify({cidVersion: 1}));

  const pinned = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {Authorization: `Bearer ${jwt}`},
    body,
  });

  if (!pinned.ok) {
    return json({error: "The pinning service refused that upload."}, 502);
  }

  const {IpfsHash} = await pinned.json();
  return json({uri: `ipfs://${IpfsHash}`, cid: IpfsHash});
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {"content-type": "application/json"},
  });
}
