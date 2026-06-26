import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SearchKeywordService } from './search-keyword.service';

describe('SearchKeywordService', () => {
  let service: SearchKeywordService;
  let prismaMock: any;
  let jwtServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      searchKeywordLog: {
        create: jest.fn().mockResolvedValue({ id: 1n }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    jwtServiceMock = {
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchKeywordService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
      ],
    }).compile();

    service = module.get<SearchKeywordService>(SearchKeywordService);
  });

  describe('normalizeSearchKeyword', () => {
    it('should lowercase, trim, remove diacritics, and merge whitespace', () => {
      expect(service.normalizeSearchKeyword('  Thức ăn chó  ')).toBe('thuc an cho');
      expect(service.normalizeSearchKeyword('THỨ C ĂN  CHÓ')).toBe('thu c an cho');
    });

    it('should keep tech-specific special characters like +, #, .', () => {
      expect(service.normalizeSearchKeyword('C++')).toBe('c++');
      expect(service.normalizeSearchKeyword('C#')).toBe('c#');
      expect(service.normalizeSearchKeyword('Next.js')).toBe('next.js');
      expect(service.normalizeSearchKeyword('Node.js')).toBe('node.js');
      expect(service.normalizeSearchKeyword('React JS')).toBe('react js');
    });

    it('should remove general non-alphanumeric special characters', () => {
      expect(service.normalizeSearchKeyword('React-JS!')).toBe('react js');
      expect(service.normalizeSearchKeyword('python@3')).toBe('python 3');
    });
  });

  describe('canonicalizeSearchKeyword', () => {
    it('should map React keywords to "reactjs"', () => {
      expect(service.canonicalizeSearchKeyword('react')).toBe('reactjs');
      expect(service.canonicalizeSearchKeyword('reactjs')).toBe('reactjs');
      expect(service.canonicalizeSearchKeyword('react js')).toBe('reactjs');
      expect(service.canonicalizeSearchKeyword('react.js')).toBe('reactjs');
    });

    it('should map Next keywords to "nextjs"', () => {
      expect(service.canonicalizeSearchKeyword('next')).toBe('nextjs');
      expect(service.canonicalizeSearchKeyword('nextjs')).toBe('nextjs');
      expect(service.canonicalizeSearchKeyword('next js')).toBe('nextjs');
      expect(service.canonicalizeSearchKeyword('next.js')).toBe('nextjs');
    });

    it('should map Node keywords to "nodejs"', () => {
      expect(service.canonicalizeSearchKeyword('node')).toBe('nodejs');
      expect(service.canonicalizeSearchKeyword('nodejs')).toBe('nodejs');
      expect(service.canonicalizeSearchKeyword('node js')).toBe('nodejs');
      expect(service.canonicalizeSearchKeyword('node.js')).toBe('nodejs');
    });

    it('should map JS/TS to javascript/typescript', () => {
      expect(service.canonicalizeSearchKeyword('js')).toBe('javascript');
      expect(service.canonicalizeSearchKeyword('javascript')).toBe('javascript');
      expect(service.canonicalizeSearchKeyword('ts')).toBe('typescript');
      expect(service.canonicalizeSearchKeyword('typescript')).toBe('typescript');
    });

    it('should NOT incorrectly group separate search intents', () => {
      // react native must stay react native
      expect(service.canonicalizeSearchKeyword('react native')).toBe('react native');
      // java must stay java
      expect(service.canonicalizeSearchKeyword('java')).toBe('java');
      // c must stay c
      expect(service.canonicalizeSearchKeyword('c')).toBe('c');
      // nextjs and nuxtjs should be distinct
      expect(service.canonicalizeSearchKeyword('nuxtjs')).toBe('nuxtjs');
    });
  });

  describe('logSearchKeyword', () => {
    it('should save the original keyword, normalizedKeyword, and canonicalKeyword to database', async () => {
      const dto = {
        keyword: '  React.JS  ',
        source: 'home',
        resultCount: 10,
        sessionId: 'sess-123',
      };

      await service.logSearchKeyword(dto, undefined, '127.0.0.1');

      expect(prismaMock.searchKeywordLog.create).toHaveBeenCalledWith({
        data: {
          keyword: 'React.JS',
          normalizedKeyword: 'react.js',
          canonicalKeyword: 'reactjs',
          userId: null,
          sessionId: 'sess-123',
          ipAddress: '127.0.0.1',
          source: 'home',
          resultCount: 10,
        },
      });
    });

    it('should ignore keywords with canonical length less than 2', async () => {
      const dto = { keyword: '  a  ' };
      await service.logSearchKeyword(dto);
      expect(prismaMock.searchKeywordLog.create).not.toHaveBeenCalled();
    });
  });
});
