import { Controller, Get, Query, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HomeQueryDto } from './dto/home-query.dto';
import { HomeService } from './home.service';

@ApiTags('home')
@Controller({ path: 'home', version: VERSION_NEUTRAL })
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @ApiOperation({ summary: 'Get all home page data' })
  @Get()
  getHome(@Query() query: HomeQueryDto) {
    return this.homeService.getHome(query);
  }
}
