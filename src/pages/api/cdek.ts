import type { NextApiRequest, NextApiResponse } from 'next';

const CDEK_LOGIN = 'ANea2n2jdZZ9CENP0OIfMycjZ6UquHyE';
const CDEK_PASS = 'MXNn60CAXVmFkc8jIIBNZPAx5WnWubJx';

type RequestData = {
  action?: string;
  [key: string]: any;
};

type TokenResponse = {
  access_token: string;
};

type HttpRequestResponse = {
  result: string;
  addedHeaders: string[];
};

class Service {
  private login: string;
  private secret: string;
  private baseUrl: string;
  private authToken: string | null;
  private requestData: RequestData | null;

  constructor(login: string, secret: string, baseUrl = 'https://api.cdek.ru/v2') {
    this.login = login;
    this.secret = secret;
    this.baseUrl = baseUrl;
    this.authToken = null;
    this.requestData = null;
  }

  async process(req: NextApiRequest, res: NextApiResponse) {
    this.requestData = { ...req.query, ...JSON.parse(req.body || '{}') };

    if (!this.requestData?.action) {
      return this.sendValidationError(res, 'Action is required');
    }

    await this.getAuthToken();

    switch (this.requestData.action) {
      case 'offices':
        return this.sendResponse(res, await this.getOffices());
      case 'calculate':
        return this.sendResponse(res, await this.calculate());
      default:
        return this.sendValidationError(res, 'Unknown action');
    }
  }

  private sendValidationError(res: NextApiResponse, message: string) {
    this.httpResponseCode(res, 400);
    this.sendJsonResponse(res, { message });
  }

  private httpResponseCode(res: NextApiResponse, code: number) {
    res.status(code);
  }

  private async getAuthToken() {
    const tokenResponse = await this.httpRequest('oauth/token', {
      grant_type: 'client_credentials',
      client_id: this.login,
      client_secret: this.secret,
    }, true);

    const result: TokenResponse = JSON.parse(tokenResponse.result);
    if (!result.access_token) {
      throw new Error('Server not authorized to CDEK API');
    }

    this.authToken = result.access_token;
  }

  private async httpRequest<T>(method: string, data: any, useFormData = false, useJson = false): Promise<HttpRequestResponse> {
    let url = `${this.baseUrl}/${method}`;
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'X-App-Name': 'widget_pvz',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    let options: RequestInit = {
      method: useFormData || useJson ? 'POST' : 'GET',
      headers,
    };

    if (useFormData) {
      options.body = new URLSearchParams(data).toString();
    } else if (useJson) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data);
    } else {
      const params = new URLSearchParams(data).toString();
      url += `?${params}`;
    }

    const response = await fetch(url, options);
    const result = await response.text();

    return {
      result,
      addedHeaders: this.getHeaderValue(response.headers),
    };
  }

  private getHeaderValue(headers: Headers): string[] {
    const headerLines: string[] = [];
    headers.forEach((value, key) => {
      if (key.startsWith('x-')) {
        headerLines.push(`${key}: ${value}`);
      }
    });
    return headerLines;
  }

  private sendResponse(res: NextApiResponse, data: HttpRequestResponse) {
    this.httpResponseCode(res, 200);
    this.sendJsonResponse(res, JSON.parse(data.result));
  }

  private sendJsonResponse(res: NextApiResponse, data: any) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Service-Version', '3.10.3');
    res.json(data);
  }

  private async getOffices(): Promise<HttpRequestResponse> {
    return this.httpRequest('deliverypoints', this.requestData);
  }

  private async calculate(): Promise<HttpRequestResponse> {
    return this.httpRequest('calculator/tarifflist', this.requestData, false, true);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('CDEK API request received, CDEK_LOGIN', CDEK_LOGIN);
  const service = new Service(CDEK_LOGIN!, CDEK_PASS!);
  await service.process(req, res);
}