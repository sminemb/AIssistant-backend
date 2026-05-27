import { v2 as cloudinary } from "cloudinary";
import type { AppEnv } from "./env.js";

export function configureCloudinary(env: AppEnv) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}
