import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  UploadApiOptions,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import { randomUUID } from 'node:crypto';

export type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type CloudinaryUploadOptions = {
  folder: string;
  fileNamePrefix?: string;
  resourceType?: UploadApiOptions['resource_type'];
  deliveryType?: UploadApiOptions['type'];
};

@Injectable()
export class CloudinaryService {
  private readonly baseFolder: string;

  constructor(private readonly configService: ConfigService) {
    this.baseFolder = this.configService.get<string>('cloudinaryFolder') ?? 'upnext';
  }

  async uploadBuffer(file: UploadedFile | undefined, options: CloudinaryUploadOptions) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    this.ensureConfigured();

    const publicId = [options.fileNamePrefix, randomUUID()].filter(Boolean).join('-');

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `${this.baseFolder}/${options.folder}`,
          public_id: publicId,
          resource_type: options.resourceType ?? 'auto',
          type: options.deliveryType ?? 'upload',
          use_filename: false,
          unique_filename: false,
          overwrite: false,
          // Do NOT set `format` explicitly — forcing format triggers Cloudinary
          // image processing for non-image files (e.g. PDFs → "Invalid image file").
        },
        (error: UploadApiErrorResponse | undefined, response: UploadApiResponse | undefined) => {
          if (error) {
            reject(
              new BadGatewayException(
                error.message ?? 'Cloudinary upload failed',
              ),
            );
            return;
          }

          if (!response) {
            reject(new BadGatewayException('Cloudinary upload failed: empty response'));
            return;
          }

          resolve(response);
        },
      );

      upload.end(file.buffer);
    });

    return {
      storageKey: result.public_id,
      publicUrl: result.secure_url,
      resourceType: result.resource_type,
      bytes: result.bytes,
    };
  }

  createSignedUrl(
    storageKey: string,
    options?: {
      resourceType?: UploadApiOptions['resource_type'];
      deliveryType?: UploadApiOptions['type'];
      expiresAt?: number;
    },
  ) {
    this.ensureConfigured();

    const deliveryType = options?.deliveryType ?? 'authenticated';
    const resourceType = options?.resourceType ?? 'image';
    const expiresAt = options?.expiresAt ?? Math.floor(Date.now() / 1000) + 5 * 60;

    if (deliveryType === 'authenticated' || deliveryType === 'private') {
      return cloudinary.utils.private_download_url(storageKey, '', {
        resource_type: resourceType,
        type: deliveryType,
        expires_at: expiresAt,
      });
    }

    // For 'upload' delivery type: files are publicly accessible on the Cloudinary CDN.
    // Do NOT add sign_url/expires_at here — Cloudinary translates expires_at into an
    // e_<timestamp> transformation which is NOT supported on raw resources and causes
    // the download to fail with a non-PDF response ("Failed to load PDF document").
    return cloudinary.url(storageKey, {
      resource_type: resourceType,
      type: deliveryType,
      secure: true,
    });
  }

  async deleteAsset(
    storageKey: string,
    resourceType: UploadApiOptions['resource_type'] = 'image',
    deliveryType: UploadApiOptions['type'] = 'upload',
  ) {
    this.ensureConfigured();
    await cloudinary.uploader.destroy(storageKey, {
      resource_type: resourceType,
      type: deliveryType,
      invalidate: true,
    });
  }

  private ensureConfigured() {
    const cloudName = this.configService.get<string>('cloudinaryCloudName');
    const apiKey = this.configService.get<string>('cloudinaryApiKey');
    const apiSecret = this.configService.get<string>('cloudinaryApiSecret');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Cloudinary is not configured');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }
}
