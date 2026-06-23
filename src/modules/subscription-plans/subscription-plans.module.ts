import { Module } from "@nestjs/common";
import {SubscriptionPlansService} from './subscription-plans.service'
import {SubscriptionPlansController} from './subscription-plans.controller'
import { PrismaModule } from "../../prisma/prisma.module";
@Module({
    imports:[PrismaModule],
    controllers:[SubscriptionPlansController],
    providers:[SubscriptionPlansService],
    exports:[
        SubscriptionPlansService
    ]
})
export class SubscriptionPlansModule {}