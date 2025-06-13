import bwipjs from 'bwip-js';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import FormData from 'form-data';
import crypto from 'crypto';

function createSignedUrl(publicId, cloudName, apiKey, apiSecret, expiresInSec = 3600) {
  const timestamp = Math.floor(Date.now() / 1000) + expiresInSec;
  const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

  return `https://res.cloudinary.com/${cloudName}/image/upload?public_id=${publicId}&timestamp=${timestamp}&signature=${signature}&api_key=${apiKey}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Only POST allowed');
  }

  const { memberName, sessionTime, sessionDate, barcodeValue } = req.body;

  try {
    const barcodeSvg = bwipjs.toSVG({
      bcid: 'code128',
      text: barcodeValue,
      scale: 3,
      height: 10,
      includetext: false,
    });

    const svgImage = `<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font: bold 24px sans-serif; }
    .label { font: 16px sans-serif; }
  </style>
  <rect width="100%" height="100%" fill="white"/>
  <text x="40" y="40" class="title">Tribe Sauna + Ice</text>
  <text x="40" y="80" class="label">Name: ${memberName}</text>
  <text x="40" y="110" class="label">Time: ${sessionTime}</text>
  <text x="40" y="140" class="label">Date: ${sessionDate}</text>
  <g transform="translate(40, 180)">
    ${barcode}
  </g>
</svg>`
      .replace('${memberName}', memberName)
      .replace('${sessionTime}', sessionTime)
      .replace('${sessionDate}', sessionDate)
      .replace('${barcode}', barcodeSvg);

    const buffer = Buffer.from(svgImage);
    const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
    const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    const publicId = `barcode-${uuidv4()}`;

    const form = new FormData();
    form.append('file', buffer, { filename: `${publicId}.svg` });
    form.append('upload_preset', uploadPreset);
    form.append('api_key', cloudinaryApiKey);
    form.append('timestamp', Math.floor(Date.now() / 1000));
    form.append('public_id', publicId);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: form.getHeaders(),
      body: form,
    });

    const uploadJson = await uploadRes.json();
    if (!uploadJson.public_id) {
      throw new Error('Cloudinary upload failed');
    }

    const signedUrl = createSignedUrl(publicId, cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret);
    return res.status(200).json({ imageUrl: signedUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Image generation or upload failed' });
  }
}
