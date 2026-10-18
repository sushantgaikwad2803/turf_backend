import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { getErrorMessage } from '../helpers.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
  },
});

router.post(
  '/turf-image',
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Image file is required.' });
      }

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'turf-booking/turfs', resource_type: 'image' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        );
        stream.end(req.file!.buffer);
      });

      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully.',
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      });
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload image.',
        details: getErrorMessage(error),
      });
    }
  },
);

export default router;