import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const hashedPassword = await argon2.hash(registerDto.password);

    const user = await this.usersService.create({
      name: registerDto.name,
      email: registerDto.email,
      password: hashedPassword,
    });

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(user.password, loginDto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: user.id, email: user.email };

    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn as any,
    });

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const hashedRefreshToken = await argon2.hash(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.usersService.createRefreshToken(user.id, hashedRefreshToken, expiresAt);

    const { password, ...userWithoutPassword } = user;

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: userWithoutPassword,
    };
  }

  async logout(userId: number) {
    await this.usersService.revokeAllUserRefreshTokens(userId);
    return { message: 'Successfully logged out' };
  }
}
