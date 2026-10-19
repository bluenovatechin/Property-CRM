import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ActivityService } from './common/activity.service';
import { AuthGuard, Public } from './common/auth';
import { MailService } from './common/mail.service';
import { NotifyService } from './common/notify.service';
import { ScopeService } from './common/scope.service';
import { AuthController, AuthService } from './modules/auth';
import { ExpensesController, ExpensesService } from './modules/expenses';
import { JobsController, JobsService } from './modules/jobs';
import { LeasesController, LeasesService } from './modules/leases';
import { MaintenanceController, MaintenanceService } from './modules/maintenance';
import { ActivityController, NotificationsController, SearchController } from './modules/misc';
import { OwnersController, OwnersService } from './modules/owners';
import { PortalController, PortalService } from './modules/portal';
import { PropertiesController, PropertiesService } from './modules/properties';
import { RentController, RentService } from './modules/rent';
import { ReportsController, ReportsService } from './modules/reports';
import { TenantsController, TenantsService } from './modules/tenants';
import { UnitsController, UnitsService } from './modules/units';
import { UsersController, UsersService } from './modules/users';
import { PrismaModule, PrismaService } from './prisma.service';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date().toISOString() };
  }
}

@Module({
  imports: [PrismaModule, JwtModule.register({}), ScheduleModule.forRoot()],
  controllers: [
    HealthController,
    AuthController,
    UsersController,
    OwnersController,
    PropertiesController,
    UnitsController,
    TenantsController,
    LeasesController,
    RentController,
    MaintenanceController,
    ExpensesController,
    ReportsController,
    NotificationsController,
    SearchController,
    ActivityController,
    PortalController,
    JobsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    ScopeService,
    ActivityService,
    MailService,
    NotifyService,
    AuthService,
    UsersService,
    OwnersService,
    PropertiesService,
    UnitsService,
    TenantsService,
    LeasesService,
    RentService,
    MaintenanceService,
    ExpensesService,
    ReportsService,
    PortalService,
    JobsService,
  ],
})
export class AppModule {}
