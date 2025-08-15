// Minimal node-fetch type fixes for TS when importing FormData/Blob
declare module 'node-fetch' {
  export const FormData: {
    prototype: FormData;
    new (): FormData;
  };
  export class Blob {
    constructor(parts?: any[], options?: any);
  }
}
