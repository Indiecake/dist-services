import type {
  CategoryResponse,
  CreateCategoryRequest,
  CreateProductRequest,
  PatchCategoryRequest,
  PatchProductRequest,
  ProductResponse
} from '@services-sandbox/contracts/http/catalog';
import {
  isCategoryListResponse,
  isCategoryResponse,
  isProductListResponse,
  isProductResponse
} from '@services-sandbox/contracts/http/catalog';

import {
  createHttpClient,
  type HttpRequestContext,
  type HttpResponse
} from './http-client.ts';

interface InventoryServiceClient {
  listCategories(context: HttpRequestContext): Promise<HttpResponse<CategoryResponse[]>>;
  getCategory(
    categoryId: string,
    context: HttpRequestContext
  ): Promise<HttpResponse<CategoryResponse>>;
  createCategory(
    body: CreateCategoryRequest,
    context: HttpRequestContext
  ): Promise<HttpResponse<CategoryResponse>>;
  patchCategory(
    categoryId: string,
    body: PatchCategoryRequest,
    context: HttpRequestContext
  ): Promise<HttpResponse<CategoryResponse>>;
  deleteCategory(categoryId: string, context: HttpRequestContext): Promise<HttpResponse>;
  listProducts(
    query: { categoryId?: string },
    context: HttpRequestContext
  ): Promise<HttpResponse<ProductResponse[]>>;
  getProduct(
    productId: string,
    context: HttpRequestContext
  ): Promise<HttpResponse<ProductResponse>>;
  createProduct(
    body: CreateProductRequest,
    context: HttpRequestContext
  ): Promise<HttpResponse<ProductResponse>>;
  patchProduct(
    productId: string,
    body: PatchProductRequest,
    context: HttpRequestContext
  ): Promise<HttpResponse<ProductResponse>>;
  deleteProduct(productId: string, context: HttpRequestContext): Promise<HttpResponse>;
}

export function createInventoryServiceClient(
  httpClient: ReturnType<typeof createHttpClient>
): InventoryServiceClient {
  return {
    listCategories(context) {
      return httpClient<CategoryResponse[]>('/categories', { method: 'GET' }, context);
    },
    getCategory(categoryId, context) {
      return httpClient<CategoryResponse>(
        `/categories/${encodeURIComponent(categoryId)}`,
        { method: 'GET' },
        context
      );
    },
    createCategory(body, context) {
      return httpClient<CategoryResponse>(
        '/categories',
        { method: 'POST', body: JSON.stringify(body) },
        context
      );
    },
    patchCategory(categoryId, body, context) {
      return httpClient<CategoryResponse>(
        `/categories/${encodeURIComponent(categoryId)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
        context
      );
    },
    deleteCategory(categoryId, context) {
      return httpClient(`/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }, context);
    },
    listProducts(query, context) {
      const search =
        query.categoryId === undefined || query.categoryId === ''
          ? ''
          : `?categoryId=${encodeURIComponent(query.categoryId)}`;
      return httpClient<ProductResponse[]>(`/products${search}`, { method: 'GET' }, context);
    },
    getProduct(productId, context) {
      return httpClient<ProductResponse>(
        `/products/${encodeURIComponent(productId)}`,
        { method: 'GET' },
        context
      );
    },
    createProduct(body, context) {
      return httpClient<ProductResponse>(
        '/products',
        { method: 'POST', body: JSON.stringify(body) },
        context
      );
    },
    patchProduct(productId, body, context) {
      return httpClient<ProductResponse>(
        `/products/${encodeURIComponent(productId)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
        context
      );
    },
    deleteProduct(productId, context) {
      return httpClient(`/products/${encodeURIComponent(productId)}`, { method: 'DELETE' }, context);
    }
  };
}

export {
  isCategoryListResponse,
  isCategoryResponse,
  isProductListResponse,
  isProductResponse
};
