const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const allowedMimeTypes = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp'
};
const maxImageSizeBytes = 5 * 1024 * 1024;

const isConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function createUploadError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getPublicBaseUrl() {
  return process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function parseBase64Image(dataUri) {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(dataUri || '');
  if (!match) {
    throw createUploadError('Formato de imagem inválido. Utilize PNG, JPG ou WEBP.');
  }

  const mimeType = match[1].toLowerCase();
  const extension = allowedMimeTypes[mimeType];

  if (!extension) {
    throw createUploadError('Tipo de imagem não suportado.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw createUploadError('A imagem enviada está vazia.');
  }

  if (buffer.length > maxImageSizeBytes) {
    throw createUploadError('A imagem excede o limite de 5MB.', 413);
  }

  return { buffer, mimeType, extension, sizeBytes: buffer.length };
}

async function saveLocally({ buffer, extension, folder }) {
  const safeFolder = folder.replace(/[\\/]+/g, '-');
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const outputDirectory = path.resolve(__dirname, '..', '..', 'uploads', safeFolder);
  await fs.mkdir(outputDirectory, { recursive: true });

  const absolutePath = path.join(outputDirectory, fileName);
  await fs.writeFile(absolutePath, buffer);

  const publicPath = `/uploads/${safeFolder}/${fileName}`;
  return {
    url: `${getPublicBaseUrl()}${publicPath}`,
    publicId: null,
    provider: 'local',
    storagePath: absolutePath
  };
}

async function uploadBase64Image(dataUri, folder) {
  const parsed = parseBase64Image(dataUri);

  if (!isConfigured) {
    return {
      ...(await saveLocally({ buffer: parsed.buffer, extension: parsed.extension, folder })),
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes
    };
  }

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'image'
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    provider: 'cloudinary',
    storagePath: null,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes
  };
}

module.exports = {
  uploadBase64Image,
  isConfigured,
  maxImageSizeBytes,
  parseBase64Image
};
