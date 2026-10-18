# Guid Typescript

Guid Typescript is a library that lets you generate guid code

## Installation and usage
### Installation

```
npm i guid-typescript --save
```

### Basic usage

```typescript
import { Guid } from "guid-typescript";

export class Example {
    public id: Guid;
    constructor() {
        this.id = Guid.create(); // ==> b77d409a-10cd-4a47-8e94-b0cd0ab50aa1
    }
}
```

## Props and Methods

| Method/Prop | Description | Test | Status |
|---|---|---|---|
| static isGuid (guid: any): boolean | Check if value is a guid code | OK | Ready |
| static create ( ): Guid | Create a new guid | OK | Ready |
| static createEmpty ( ): Guid | Create an empty guid | OK | Ready |
| static parse (guid: string): Guid | Creates a guid instance from a given guid as string  | OK | Ready |
| static raw ( ): string | Create a guid code in string format  | OK | Ready |
| equals (other: Guid): boolean | Compare a guid code | OK | Ready |
| isEmpty ( ): boolean | Validate if a guid is empty  | OK | Ready |
| toString ( ): string | Parse a guid instance to string format  | OK | Ready |
| toJSON ( ): any | Parse to JSON format  | OK | Ready |




## Distribution license notice added by The Way Here

The installed guid-typescript 1.0.9 package declares license ISC and author nicolas. Its original package.json accompanies this notice. The following standardized ISC license text is supplied from the SPDX license list; the upstream npm archive omits a separate license file.

ISC License

Copyright <year> <owner> 

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
