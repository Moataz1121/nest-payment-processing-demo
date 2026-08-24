import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '../../generated/prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: { name: string; email: string; password: string }): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async createRefreshToken(userId: number, tokenHash: string, expiresAt: Date) {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        token: tokenHash,
        expiresAt,
      },
    });
  }

  async revokeAllUserRefreshTokens(userId: number) {
    return this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}
