import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { parseFrontendOrigins } from './common/cors-origins.js';

async function bootstrap() {
  const useObserve =
    Boolean(process.env.OBSERVE_APP_KEY) &&
    Boolean(process.env.OBSERVE_APP_SECRET) &&
    process.env.OBSERVE_APP_KEY !== 'YOUR_APP_KEY';

  const app = await NestFactory.create(AppModule, {
    ...(useObserve ? { instrument: ObserveInstrument } : {}),
    // Custom parsers below — needed for provider ID data-URL uploads
    bodyParser: false,
  });

  // Default Express limit is ~100kb; ID card data URLs exceed that
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));

  const config = app.get(ConfigService);

  app.enableCors({
    origin: parseFrontendOrigins(config.get<string>('FRONTEND_URL')),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  // Vercel captures listen() during module load — use PORT from the runtime.
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
}

void bootstrap();
