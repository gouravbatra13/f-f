import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Notification } from './notification.entity.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    private readonly dataSource: DataSource,
  ) {}

  async list(
    organizationId: string,
    userId: string,
    filters: ListNotificationsDto,
  ) {
    await this.assertMembership(organizationId, userId);
    const where = {
      organizationId,
      userId,
      ...(filters.unreadOnly ? { readAt: IsNull() } : {}),
    };
    const [data, total] = await this.notifications.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    });
    return {
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }

  async unreadCount(organizationId: string, userId: string) {
    await this.assertMembership(organizationId, userId);
    const count = await this.notifications.count({
      where: { organizationId, userId, readAt: IsNull() },
    });
    return { unreadCount: count };
  }

  async markRead(
    organizationId: string,
    notificationId: string,
    userId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `
          SELECT notification.id
          FROM notifications notification
          INNER JOIN organization_members membership
            ON membership.organization_id = notification.organization_id
          INNER JOIN organizations organization
            ON organization.id = notification.organization_id
          WHERE notification.id = ? AND notification.organization_id = ?
            AND notification.user_id = ? AND membership.user_id = ?
            AND organization.deleted_at IS NULL
          FOR UPDATE
        `,
        [notificationId, organizationId, userId, userId],
      )) as { id: string }[];
      if (!rows[0]) throw new NotFoundException('Notification not found');

      await manager.update(
        Notification,
        {
          id: notificationId,
          organizationId,
          userId,
          readAt: IsNull(),
        },
        { readAt: new Date() },
      );
      return manager.findOneOrFail(Notification, {
        where: { id: notificationId, organizationId, userId },
      });
    });
  }

  private async assertMembership(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const rows = (await this.dataSource.query(
      `
        SELECT membership.id
        FROM organization_members membership
        INNER JOIN organizations organization
          ON organization.id = membership.organization_id
        WHERE membership.organization_id = ? AND membership.user_id = ?
          AND organization.deleted_at IS NULL
        LIMIT 1
      `,
      [organizationId, userId],
    )) as { id: string }[];
    if (!rows[0]) throw new NotFoundException('Organization not found');
  }
}
