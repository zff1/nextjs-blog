import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

/**
 * 统一的API响应数据结构
 */
export interface ApiResponse<T = any> {
    code: number;
    success: boolean;
    message: string;
    data?: T;
    error?: string;
    timestamp?: number;
}

/**
 * MongoDB文档接口
 */
export interface MongoDocument {
    _id?: ObjectId;
    [key: string]: any;
}

/**
 * 数据转换工具函数
 * 将MongoDB文档转换为前端可用的数据格式
 */
export function toFrontend<T extends MongoDocument>(doc: T): Omit<T, '_id'> & { _id: string } {
    if (!doc) return doc as any;
    const { _id, ...rest } = doc;
    return {
        ...rest,
        _id: _id?.toString() || '',
    } as Omit<T, '_id'> & { _id: string };
}

/**
 * 数据转换工具函数
 * 将前端数据转换为MongoDB文档格式
 */
export function toMongo<T extends { _id?: string }>(data: T): Omit<T, '_id'> {
    if (!data) return data as any;
    const { _id, ...rest } = data;
    return rest as Omit<T, '_id'>;
}

/**
 * 批量转换MongoDB文档为前端数据
 */
export function toFrontendList<T extends MongoDocument>(docs: T[]): (Omit<T, '_id'> & { _id: string })[] {
    if (!docs) return [];
    return docs.map(doc => toFrontend(doc));
}

/**
 * 统一的API错误类型
 */
export class ApiError extends Error {
    public code: number;
    public statusCode: number;

    constructor(message: string, code: number = 500, statusCode: number = 500) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

/**
 * 预定义的错误类型
 */
export const ApiErrors = {
    // 400 错误
    BAD_REQUEST: (message = '请求参数错误') => new ApiError(message, 400, 400),
    VALIDATION_ERROR: (message = '数据验证失败') => new ApiError(message, 400, 400),
    MISSING_PARAMS: (message = '缺少必要参数') => new ApiError(message, 400, 400),

    // 401 错误
    UNAUTHORIZED: (message = '未授权访问') => new ApiError(message, 401, 401),
    TOKEN_EXPIRED: (message = '令牌已过期') => new ApiError(message, 401, 401),
    INVALID_TOKEN: (message = '无效的令牌') => new ApiError(message, 401, 401),

    // 403 错误
    FORBIDDEN: (message = '禁止访问') => new ApiError(message, 403, 403),
    INSUFFICIENT_PERMISSIONS: (message = '权限不足') => new ApiError(message, 403, 403),

    // 404 错误
    NOT_FOUND: (message = '资源不存在') => new ApiError(message, 404, 404),
    USER_NOT_FOUND: (message = '用户不存在') => new ApiError(message, 404, 404),
    ARTICLE_NOT_FOUND: (message = '文章不存在') => new ApiError(message, 404, 404),

    // 409 错误
    CONFLICT: (message = '资源冲突') => new ApiError(message, 409, 409),
    DUPLICATE_ENTRY: (message = '数据已存在') => new ApiError(message, 409, 409),

    // 429 错误
    RATE_LIMIT: (message = '请求过于频繁') => new ApiError(message, 429, 429),

    // 500 错误
    INTERNAL_ERROR: (message = '服务器内部错误') => new ApiError(message, 500, 500),
    DATABASE_ERROR: (message = '数据库连接错误') => new ApiError(message, 500, 500),
    EXTERNAL_API_ERROR: (message = '外部API调用失败') => new ApiError(message, 500, 500),
};

/**
 * 成功响应构造函数
 * @param data 返回数据
 * @param message 成功消息
 * @param code 业务状态码，默认200
 * @returns NextResponse
 */
export function successResponse<T>(
    data?: T,
    message: string = '操作成功',
    code: number = 200
): NextResponse<ApiResponse<T>> {
    const response: ApiResponse<T> = {
        code,
        success: true,
        message,
        data,
        timestamp: Date.now()
    };

    return NextResponse.json(response, { status: 200 });
}

/**
 * 错误响应构造函数
 * @param error 错误信息，可以是字符串、Error对象或ApiError对象
 * @param statusCode HTTP状态码，默认500
 * @param code 业务状态码，默认与statusCode相同
 * @returns NextResponse
 */
export function errorResponse(
    error: string | Error | ApiError,
    statusCode: number = 500,
    code?: number
): NextResponse<ApiResponse> {
    let message: string;
    let finalCode: number;
    let finalStatusCode: number;

    if (error instanceof ApiError) {
        message = error.message;
        finalCode = error.code;
        finalStatusCode = error.statusCode;
    } else if (error instanceof Error) {
        message = error.message;
        finalCode = code || statusCode;
        finalStatusCode = statusCode;
    } else {
        message = error;
        finalCode = code || statusCode;
        finalStatusCode = statusCode;
    }

    const response: ApiResponse = {
        code: finalCode,
        success: false,
        message: '操作失败',
        error: message,
        timestamp: Date.now()
    };

    return NextResponse.json(response, { status: finalStatusCode });
}

/**
 * 统一的异步错误处理装饰器
 * 用于包装API路由处理函数，自动捕获错误并返回统一格式
 * @param handler API路由处理函数
 * @returns 包装后的处理函数
 */
export function withErrorHandler<T extends any[], R>(
    handler: (...args: T) => Promise<NextResponse<ApiResponse<R>>>
) {
    return async (...args: T): Promise<NextResponse<ApiResponse<R>>> => {
        const startTime = Date.now();
        const request = args[0] as Request;
        const url = new URL(request.url);
        const apiPath = url.pathname;

        try {
            console.log(`🚀 [API] ${request.method} ${apiPath} - 开始处理`);

            const response = await handler(...args);
            const responseData = await response.json();

            // 如果响应数据中包含 MongoDB 文档，自动转换
            if (responseData?.data) {
                if (Array.isArray(responseData.data)) {
                    // 处理数组
                    responseData.data = toFrontendList(responseData.data);
                } else if (responseData.data._id instanceof ObjectId) {
                    // 处理单个文档
                    responseData.data = toFrontend(responseData.data);
                } else if (responseData.data.items && Array.isArray(responseData.data.items)) {
                    // 处理分页数据
                    const items = responseData.data.items;
                    if (items.length > 0 && items[0]._id instanceof ObjectId) {
                        responseData.data.items = toFrontendList(items);
                    }
                }
            }

            const duration = Date.now() - startTime;
            console.log(`✅ [API] ${request.method} ${apiPath} - 成功 (${duration}ms)`);

            return NextResponse.json(responseData, {
                status: response.status,
                headers: response.headers
            });
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`❌ [API] ${request.method} ${apiPath} - 失败 (${duration}ms)`, error);

            if (error instanceof ApiError) {
                return errorResponse(error);
            }

            if (error instanceof Error) {
                // 根据错误类型判断状态码
                if (error.message.includes('not found') || error.message.includes('不存在')) {
                    return errorResponse(error, 404);
                }
                if (error.message.includes('unauthorized') || error.message.includes('未授权')) {
                    return errorResponse(error, 401);
                }
                if (error.message.includes('forbidden') || error.message.includes('禁止')) {
                    return errorResponse(error, 403);
                }
                if (error.message.includes('validation') || error.message.includes('验证')) {
                    return errorResponse(error, 400);
                }

                return errorResponse(error, 500);
            }

            return errorResponse('未知错误', 500);
        }
    };
}

/**
 * 分页响应构造函数
 * @param data 数据列表
 * @param pagination 分页信息
 * @param message 成功消息
 * @returns NextResponse
 */
export function paginatedResponse<T>(
    data: T[],
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasMore: boolean;
    },
    message: string = '获取成功'
): NextResponse<ApiResponse<{ items: T[]; pagination: typeof pagination }>> {
    return successResponse({
        items: data,
        pagination
    }, message);
}

/**
 * 参数验证辅助函数
 * @param params 要验证的参数对象
 * @param requiredFields 必填字段数组
 * @throws ApiError 当缺少必填字段时抛出错误
 */
export function validateRequiredParams(
    params: Record<string, any>,
    requiredFields: string[]
): void {
    const missingFields = requiredFields.filter(field =>
        params[field] === undefined || params[field] === null || params[field] === ''
    );

    if (missingFields.length > 0) {
        throw ApiErrors.MISSING_PARAMS(`缺少必要参数: ${missingFields.join(', ')}`);
    }
}

/**
 * 邮箱格式验证
 * @param email 邮箱地址
 * @returns 是否为有效邮箱格式
 */
export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * 手机号格式验证（中国大陆）
 * @param phone 手机号
 * @returns 是否为有效手机号格式
 */
export function validatePhone(phone: string): boolean {
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(phone);
}

/**
 * 创建分页信息
 * @param page 当前页码
 * @param limit 每页条数
 * @param total 总条数
 * @returns 分页信息对象
 */
export function createPagination(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    return {
        page,
        limit,
        total,
        totalPages,
        hasMore
    };
} 