import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CuaKhauSoDeclarationDetailResponse,
  CuaKhauSoEmptyVehicleLogResponse,
  CuaKhauSoDeclarationListResponse,
  CuaKhauSoExternalListParams,
  CuaKhauSoLoginRequest,
  CuaKhauSoSession
} from './cua-khau-so.types';

type HttpMethod = 'GET' | 'POST';

type SourceHttpResponse = {
  status: number;
  headers: Headers;
  body: string;
};

const defaultBaseUrl = 'https://cuakhauso.langson.gov.vn';
const sourceUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

@Injectable()
export class CuaKhauSoClient {
  private readonly baseUrl: string;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('CUA_KHAU_SO_BASE_URL', defaultBaseUrl);
  }

  async login(credentials: CuaKhauSoLoginRequest): Promise<Omit<CuaKhauSoSession, 'expiresAt'>> {
    const response = await this.request('POST', '/api/user/authentication', {
      body: credentials,
      referer: `${this.baseUrl}/business/login`
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new UnauthorizedException(this.extractSourceMessage(response.body));
    }

    const parsed = this.parseJson(response.body);
    const accessToken = this.extractAccessToken(parsed);

    if (!accessToken) {
      throw new BadGatewayException('Cửa khẩu số không trả về access token hợp lệ.');
    }

    return {
      accessToken,
      refreshCookies: this.extractSetCookies(response.headers),
      username: credentials.username
    };
  }

  async refreshToken(session: CuaKhauSoSession): Promise<boolean> {
    if (session.refreshCookies.length === 0) {
      return false;
    }

    const cookie = session.refreshCookies.map((value) => value.split(';')[0]).join('; ');
    const response = await this.request('POST', '/api/user/refresh-token', {
      body: {},
      cookie
    });

    if (response.status !== 200 && response.status !== 201) {
      return false;
    }

    const parsed = this.parseJson(response.body);
    const accessToken = this.extractAccessToken(parsed);

    if (!accessToken) {
      return false;
    }

    session.accessToken = accessToken;
    const refreshCookies = this.extractSetCookies(response.headers);

    if (refreshCookies.length > 0) {
      session.refreshCookies = refreshCookies;
    }

    return true;
  }

  async getDeclarations(
    session: CuaKhauSoSession,
    params: CuaKhauSoExternalListParams
  ): Promise<CuaKhauSoDeclarationListResponse> {
    const searchParams = new URLSearchParams({
      isPaging: 'true',
      pageNumber: String(params.pageNumber),
      pageSize: String(params.pageSize),
      orderbyCreate: 'false',
      isDeleted: 'false',
      searchType: '0'
    });

    if (params.status) {
      searchParams.set('status', String(params.status));
    }

    if (params.keyword) {
      searchParams.set('keyword', params.keyword);
    }

    if (params.direction) {
      searchParams.set('direction', params.direction);
    }

    return this.authenticatedGet(
      session,
      `/api/registration-transport/get-all-regtrans-lite-v2?${searchParams.toString()}`
    );
  }

  async getDeclarationDetail(
    session: CuaKhauSoSession,
    externalId: string
  ): Promise<CuaKhauSoDeclarationDetailResponse> {
    const safeId = this.normalizeExternalId(externalId);
    return this.authenticatedGet(session, `/api/registration-transport/${safeId}`);
  }

  async getEmptyVehicleLog(
    session: CuaKhauSoSession,
    vehicleRegistrationFormId: string
  ): Promise<CuaKhauSoEmptyVehicleLogResponse> {
    const safeId = this.normalizeExternalId(vehicleRegistrationFormId);
    return this.authenticatedGet(
      session,
      `/api/VehicleRegistrationForm/get-log-empty-vehicle-form/${safeId}`
    );
  }

  private async authenticatedGet<T>(session: CuaKhauSoSession, path: string): Promise<T> {
    this.assertReadOnlyPath(path);
    let response = await this.request('GET', path, {
      accessToken: session.accessToken
    });

    if (response.status === 401) {
      const refreshed = await this.refreshToken(session);

      if (!refreshed) {
        throw new UnauthorizedException('Phiên Cửa khẩu số đã hết hạn, vui lòng đăng nhập lại.');
      }

      response = await this.request('GET', path, {
        accessToken: session.accessToken
      });
    }

    if (response.status !== 200) {
      throw new BadGatewayException(`Cửa khẩu số trả về HTTP ${response.status}.`);
    }

    return this.parseJson(response.body) as T;
  }

  private async request(
    method: HttpMethod,
    path: string,
    options: {
      accessToken?: string;
      body?: unknown;
      cookie?: string;
      referer?: string;
    } = {}
  ): Promise<SourceHttpResponse> {
    const headers = this.createHeaders(options.accessToken, options.referer);

    if (options.cookie) {
      headers.set('Cookie', options.cookie);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal
      };

      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }

      const response = await fetch(`${this.baseUrl}${path}`, init);
      const body = await response.text();

      return {
        status: response.status,
        headers: response.headers,
        body
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Cửa khẩu số phản hồi quá lâu.');
      }

      throw new BadGatewayException('Không thể kết nối Cửa khẩu số.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private createHeaders(accessToken?: string, referer?: string) {
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': sourceUserAgent,
      Origin: this.baseUrl,
      Referer: referer ?? `${this.baseUrl}/`
    });

    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    return headers;
  }

  private assertReadOnlyPath(path: string) {
    const pathname = path.split('?')[0] ?? path;
    const isAllowed =
      pathname === '/api/registration-transport/get-all-regtrans-lite-v2' ||
      pathname === '/api/registration-transport/get-registration-transport-step' ||
      /^\/api\/VehicleRegistrationForm\/get-log-empty-vehicle-form\/[0-9a-fA-F-]{36}$/.test(
        pathname
      ) ||
      /^\/api\/registration-transport\/[0-9a-fA-F-]{36}$/.test(pathname);

    if (!isAllowed) {
      throw new BadRequestException('Endpoint Cửa khẩu số không nằm trong danh sách đọc an toàn.');
    }
  }

  private normalizeExternalId(externalId: string) {
    const normalized = externalId.trim();

    if (!/^[0-9a-fA-F-]{36}$/.test(normalized)) {
      throw new BadRequestException('Mã tờ khai Cửa khẩu số không hợp lệ.');
    }

    return normalized;
  }

  private parseJson(body: string): unknown {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new BadGatewayException('Cửa khẩu số trả về dữ liệu không hợp lệ.');
    }
  }

  private extractAccessToken(value: unknown): string | undefined {
    const token = this.findString(value, ['accessToken', 'access_token', 'token']);
    return token?.trim() || undefined;
  }

  private findString(value: unknown, keys: string[]): string | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    for (const key of keys) {
      if (key in value) {
        const found = (value as Record<string, unknown>)[key];

        if (typeof found === 'string') {
          return found;
        }
      }
    }

    if ('data' in value) {
      return this.findString((value as Record<string, unknown>).data, keys);
    }

    return undefined;
  }

  private extractSetCookies(headers: Headers): string[] {
    const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = withGetSetCookie.getSetCookie?.();

    if (setCookies && setCookies.length > 0) {
      return setCookies;
    }

    const combined = headers.get('set-cookie');

    if (!combined) {
      return [];
    }

    return combined.split(/,(?=\s*[^;=]+=[^;]+)/).map((value) => value.trim());
  }

  private extractSourceMessage(body: string) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const message = parsed.message ?? parsed.error;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    } catch {
      return 'Không thể đăng nhập Cửa khẩu số.';
    }

    return 'Không thể đăng nhập Cửa khẩu số.';
  }
}
