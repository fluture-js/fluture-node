/// <reference types="node" />

import EventEmitter from 'events';
import {FutureInstance} from 'fluture';
import {RequestOptions, IncomingMessage} from 'http';
import {ParsedUrlQueryInput} from 'querystring';
import {Readable} from 'stream';

export const once: <T = unknown>(event: string) => (emitter: EventEmitter) => FutureInstance<Error, T>

export const encode: (encoding: BufferEncoding) => (buffer: Buffer) => FutureInstance<Error, string>

export const streamOf: (buffer: Buffer) => FutureInstance<never, Readable>

export const emptyStream: FutureInstance<never, Readable>

export const buffer: <T = unknown>(stream: Readable) => FutureInstance<Error, T[]>

export const bufferString: (encoding: BufferEncoding) => (stream: Readable) => FutureInstance<Error, string>

export const instant: <T>(value: T) => FutureInstance<never, T>

export const immediate: <T>(value: T) => FutureInstance<never, T>

export interface Request {
  options: Omit<RequestOptions, 'auth' | 'host' | 'hostname' | 'path' | 'port' | 'protocol' | 'signal'>
  url: string
  body: FutureInstance<Error, Readable>
}

export const Request: {
  (options: Request['options']): (url: Request['url']) => (body: Request['body']) => Request
  options: (request: Request) => Request['options']
  url: (request: Request) => Request['url']
  body: (request: Request) => Request['body']
}

export interface Response {
  request: Request
  message: IncomingMessage
}

export const Response: {
  (request: Response['request']): (message: Response['message']) => Response
  request: (request: Response) => Response['request']
  message: (request: Response) => Response['message']
}

export const sendRequest: (request: Request) => FutureInstance<Error, Response>

export type Headers = Record<string, string>

export const retrieve: (url: Request['url']) => (headers: Headers) => FutureInstance<Error, Response>

export const send: (mime: string) => (method: Request['options']['method']) => (url: Request['url']) => (headers: Headers) => (buffer: Buffer) => FutureInstance<Error, Response>

export const sendJson: (method: Request['options']['method']) => (url: Request['url']) => (headers: Headers) => (json: any) => FutureInstance<Error, Response>

export const sendForm: (method: Request['options']['method']) => (url: Request['url']) => (headers: Headers) => (form: ParsedUrlQueryInput) => FutureInstance<Error, Response>

export type StatusCode = number

export const matchStatus: <T>(onMismatch: (response: Response) => T) => (matches: Record<StatusCode, (response: Response) => T>) => (response: Response) => T

export interface RedirectionStrategy {
  (response: Response): Request
}

export const redirectAnyRequest: RedirectionStrategy

export const redirectIfGetMethod: RedirectionStrategy

export const redirectUsingGetMethod: RedirectionStrategy

export const retryWithoutCondition: RedirectionStrategy

export const defaultRedirectionPolicy: RedirectionStrategy

export const aggressiveRedirectionPolicy: RedirectionStrategy

export const followRedirectsWith: (strategy: RedirectionStrategy) => (max: number) => (response: Response) => FutureInstance<Error, Response>

export const followRedirects: (max: number) => (response: Response) => FutureInstance<Error, Response>

export const acceptStatus: (code: StatusCode) => (response: Response) => FutureInstance<Response, Response>

export const bufferMessage: (encoding: BufferEncoding) => (message: IncomingMessage) => FutureInstance<Error, String>

export const bufferResponse: (encoding: BufferEncoding) => (response: Response) => FutureInstance<Error, String>

export const autoBufferMessage: (message: IncomingMessage) => FutureInstance<Error, String>

export const autoBufferResponse: (response: Response) => FutureInstance<Error, String>

export const responseToError: (response: Response) => FutureInstance<Error, never>
