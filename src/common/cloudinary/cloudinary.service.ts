import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiOptions, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { extname } from 'node:path';
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

    const extension = extname(file.originalname).replace('.', '');
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
          ...(extension ? { format: extension } : {}),
        },
        (error: UploadApiErrorResponse | undefined, response: UploadApiResponse | undefined) => {
          if (error) {
            reject(new Error(error.message ?? 'Cloudinary upload failed'));
            return;
          }

          if (!response) {
            reject(new Error('Cloudinary upload failed'));
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

    return cloudinary.url(storageKey, {
      resource_type: resourceType,
      type: deliveryType,
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
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
