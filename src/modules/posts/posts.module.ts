import { Module } from '@nestjs/common';
import { AdminPostsController } from './admin-posts.controller';
import { PostsService } from './posts.service';

@Module({
  controllers: [AdminPostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
