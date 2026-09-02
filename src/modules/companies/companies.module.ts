import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../common/email/email.service';
import { ReputationModule } from '../reputation/reputation.module';
import { AiModule } from '../ai/ai.module';
import { FallbackCompanyLicenseExtractionAdapter } from './adapters/fallback-company-license-extraction.adapter';
import { GeminiCompanyLicenseExtractionAdapter } from './adapters/gemini-company-license-extraction.adapter';
import { HttpCompanyLicenseExtractionAdapter } from './adapters/http-company-license-extraction.adapter';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import {
  COMPANY_LICENSE_EXTRACTION_PROVIDER,
  CompanyLicenseExtractionProviderPort,
} from './ports/company-license-extraction-provider.port';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ReputationModule, AiModule, AuthModule],
  controllers: [CompaniesController],
  providers: [
    CompaniesService,
    EmailService,
    GeminiCompanyLicenseExtractionAdapter,
    HttpCompanyLicenseExtractionAdapter,
    {
      provide: COMPANY_LICENSE_EXTRACTION_PROVIDER,
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpCompanyLicenseExtractionAdapter,
        geminiAdapter: GeminiCompanyLicenseExtractionAdapter,
      ): CompanyLicenseExtractionProviderPort => {
        if (configService.get<string>('aiCompanyLicenseProvider') !== 'upnext-ai') {
          return geminiAdapter;
        }
        if (configService.get<boolean>('aiCompanyLicenseFallbackToGemini') === false) {
          return httpAdapter;
        }
        return new FallbackCompanyLicenseExtractionAdapter(httpAdapter, geminiAdapter);
      },
      inject: [
        ConfigService,
        HttpCompanyLicenseExtractionAdapter,
        GeminiCompanyLicenseExtractionAdapter,
      ],
    },
  ],
})
export class CompaniesModule {}
