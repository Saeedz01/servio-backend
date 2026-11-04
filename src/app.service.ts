import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      status: 'ok',
      service: 'servio-backend',
      docs: '/api',
    };
  }

  /** @deprecated use getStatus */
  getHello(): string {
    return 'Hello World!';
  }
}
