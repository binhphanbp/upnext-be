import { Module } from '@nestjs/common';
import { AdminPostCategoriesController } from './admin-post-categories.controller';
import { AdminPostTagsController } from './admin-post-tags.controller';
import { AdminPostsController } from './admin-posts.controller';
import { PostSlugService } from './post-slug.service';
import { PostsService } from './posts.service';
import { PublicPostsController } from './public-posts.controller';

@Module({
  controllers: [
    PublicPostsController,
    AdminPostsController,
    AdminPostCategoriesController,
    AdminPostTagsController,
  ],
  providers: [PostsService, PostSlugService],
  exports: [PostsService, PostSlugService],
})
export class PostsModule {}
