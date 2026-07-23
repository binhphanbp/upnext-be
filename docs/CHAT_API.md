# Chat API – Tài liệu kỹ thuật

> **Module:** `src/modules/conversations`
> **Base URL (REST):** `/conversations`
> **WebSocket Namespace:** `/chat`
> **Yêu cầu Auth:** JWT Bearer token (tất cả endpoint)

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Loại hội thoại (ConversationType)](#2-loại-hội-thoại-conversationtype)
3. [Vòng đời hội thoại](#3-vòng-đời-hội-thoại)
4. [REST API](#4-rest-api)
   - [GET /conversations](#41-get-conversations--danh-sách-hội-thoại)
   - [GET /conversations/:id](#42-get-conversationsid--chi-tiết-hội-thoại)
   - [GET /conversations/:id/messages](#43-get-conversationsidmessages--lịch-sử-tin-nhắn)
   - [POST /conversations/:id/messages](#44-post-conversationsidmessages--gửi-tin-nhắn)
   - [PATCH /conversations/:id/read](#45-patch-conversationsidread--đánh-dấu-đã-đọc)
   - [POST /conversations/:id/attachments](#46-post-conversationsidattachments--upload-file-đính-kèm)
   - [GET /conversations/:id/attachments/:attachmentId/access](#47-get-conversationsidattachmentsattachmentidaccess--lấy-url-truy-cập-file)
5. [WebSocket API (/chat)](#5-websocket-api-chat)
   - [Kết nối & xác thực](#51-kết-nối--xác-thực)
   - [Sự kiện Client → Server](#52-sự-kiện-client--server)
   - [Sự kiện Server → Client](#53-sự-kiện-server--client)
6. [Cấu trúc dữ liệu chung](#6-cấu-trúc-dữ-liệu-chung)
7. [Phân quyền truy cập](#7-phân-quyền-truy-cập)
8. [Rate Limiting & Giới hạn](#8-rate-limiting--giới-hạn)
9. [Cơ chế Cursor Pagination](#9-cơ-chế-cursor-pagination)
10. [Biến môi trường bật/tắt tính năng](#10-biến-môi-trường-bậttắt-tính-năng)

---

## 1. Tổng quan kiến trúc

Hệ thống chat bao gồm hai lớp giao tiếp song song:

- **REST API** (`ConversationsController`): Dùng để tải dữ liệu ban đầu (danh sách hội thoại, lịch sử tin nhắn), upload file, và đánh dấu đã đọc.
- **WebSocket** (`ConversationGateway`, namespace `/chat`): Dùng để giao tiếp realtime – gửi tin, nhận sự kiện mới, typing indicators.

```
Client
  │
  ├──[REST]──▶ ConversationsController
  │               ├── ConversationService       (list, detail)
  │               ├── MessageService            (list, send, markRead)
  │               └── MessageAttachmentService  (upload, access)
  │
  └──[WS]───▶ ConversationGateway (/chat)
                  ├── MessageService            (send, markRead)
                  ├── ConversationPolicyService (assertAccess, assertWritable)
                  └── ConversationRealtimeService (emit events)
```

**Luồng gửi tin nhắn điển hình:**

1. Client gọi `POST /conversations/:id/messages` hoặc emit `message:send` qua WS.
2. Server kiểm tra participant, rate limit, trùng lặp (`clientMessageId`).
3. Tạo message trong DB, cập nhật `latestMessage` của conversation.
4. Enqueue notification cho các participant còn lại (qua `OutboxService`).
5. Emit sự kiện `message:created` đến room WS `conversation:{id}`.

---

## 2. Loại hội thoại (ConversationType)

| Giá trị            | Mô tả                                                        | Được tạo khi                                        | Feature flag                    |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------- | ------------------------------- |
| `APPLICATION_CHAT` | Chat giữa candidate và recruiter trong một đơn ứng tuyển     | Candidate nộp hồ sơ thành công (`SUBMITTED`)        | `CHAT_APPLICATION_ENABLED=true` |
| `TALENT_OUTREACH`  | Recruiter chủ động liên hệ candidate (không qua application) | Recruiter tạo `TalentContactRequest` được chấp nhận | `CHAT_OUTREACH_ENABLED=true`    |
| `SUPPORT`          | Chat hỗ trợ giữa recruiter và admin                          | Recruiter tạo support case                          | `CHAT_SUPPORT_ENABLED=true`     |

> **Lưu ý:** Ba feature flag trên phải được bật trong `.env` để từng loại conversation hoạt động. Xem [mục 10](#10-biến-môi-trường-bậttắt-tính-năng).

---

## 3. Vòng đời hội thoại

```
ACTIVE ──[reject/withdraw]──▶ ACTIVE (có writableUntil = +7 ngày)
                                    │
                               [hết 7 ngày, cron mỗi phút]
                                    │
                                    ▼
                               READ_ONLY
                                    │
                              [interviewing/offered/hired lại]
                                    │
                                    ▼
                               ACTIVE (reset writableUntil = null)
```

- **ACTIVE**: Có thể đọc và ghi bình thường.
- **ACTIVE + writableUntil**: Application bị reject/rút – vẫn ghi được đến thời hạn (grace period 7 ngày).
- **READ_ONLY**: Hết grace period. Chỉ đọc, không gửi tin được. `ConversationExpirationService` chạy cron mỗi phút để cập nhật trạng thái.
- **CLOSED**: Conversation bị đóng hoàn toàn (admin action).

Khi chuyển sang READ_ONLY, server tự động tạo message hệ thống `CONVERSATION_READ_ONLY`.

---

### Application chat membership and hiring team

When a candidate submits an application, the server creates one `APPLICATION_CHAT` linked to the application and job post. Its initial participants are the candidate and the recruiter who created the job post. Company Owners have role-based access to every application chat in their company; they are not inserted as default participants.

- An Owner's participant record is created only when the Owner opens or acts in that chat, so it can hold read markers, personal tags, uploads and sent messages.
- The job author, an active application assignee, an active hiring-team member, or the company Owner can add colleagues.
- `POST /conversations/:id/recruiter-participants` adds a colleague to this one chat only.
- `POST /conversations/:id/hiring-team/recruiters` adds a colleague to the job hiring team, all existing application chats for the job, and every future application chat for the job.
- `GET /conversations/:id/recruiters` returns selectable active recruiters in the company with their chat/team state; `GET /conversations/:id/hiring-team` returns the active team.

All add endpoints accept:

```json
{ "recruiterAccountId": "uuid" }
```

An explicit single-chat invite is preserved if a separate application assignment is later removed. The job author and active hiring-team members also remain in the chat when an application assignment is removed.

## 4. REST API

Tất cả endpoint yêu cầu header:

```
Authorization: Bearer <access_token>
```

---

### 4.1 `GET /conversations` – Danh sách hội thoại

Lấy danh sách các hội thoại mà người dùng hiện tại tham gia, sắp xếp theo thời gian cập nhật mới nhất.

**Query Parameters:**

| Tham số  | Kiểu                        | Mô tả                                                           | Mặc định    |
| -------- | --------------------------- | --------------------------------------------------------------- | ----------- |
| `type`   | `ConversationType` (enum)   | Lọc theo loại: `APPLICATION_CHAT`, `TALENT_OUTREACH`, `SUPPORT` | (tất cả)    |
| `status` | `ConversationStatus` (enum) | Lọc theo trạng thái: `ACTIVE`, `READ_ONLY`, `CLOSED`            | Ẩn `CLOSED` |
| `cursor` | `string`                    | Cursor để lấy trang tiếp theo (base64url)                       | (trang đầu) |
| `limit`  | `integer` [1–50]            | Số lượng hội thoại mỗi trang                                    | `20`        |

**Response `200 OK`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "type": "APPLICATION_CHAT",
      "status": "ACTIVE",
      "companyId": "uuid",
      "applicationId": "uuid",
      "jobPostId": "uuid",
      "latestMessageId": "uuid",
      "latestMessageAt": "2026-07-18T00:00:00.000Z",
      "writableUntil": null,
      "version": 5,
      "createdAt": "2026-07-01T00:00:00.000Z",
      "updatedAt": "2026-07-18T00:00:00.000Z",
      "latestMessage": {
        "id": "uuid",
        "type": "TEXT",
        "content": "Xin chào bạn...",
        "createdAt": "2026-07-18T00:00:00.000Z",
        "senderParticipantId": "uuid"
      },
      "participants": [
        {
          "id": "uuid",
          "role": "CANDIDATE",
          "lastReadAt": "2026-07-18T00:00:00.000Z",
          "candidateAccount": { "id": "uuid", "fullName": "Nguyễn Văn A" },
          "recruiterAccount": null,
          "adminUser": null
        }
      ]
    }
  ],
  "meta": {
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTE4VDAwOjAwOjAwLjAwMFoiLCJpZCI6InV1aWQifQ"
  }
}
```

> `meta.nextCursor` là `null` nếu đã hết dữ liệu.

---

### 4.2 `GET /conversations/:id` – Chi tiết hội thoại

Lấy thông tin chi tiết của một hội thoại, kèm thông tin liên kết (application, talent request, support case).

**Path Parameters:**
| Tham số | Kiểu | Mô tả |
|---------|------|-------|
| `id` | `string` (UUID) | ID của hội thoại |

**Response `200 OK`:**

```json
{
  "data": {
    "id": "uuid",
    "type": "APPLICATION_CHAT",
    "status": "ACTIVE",
    "writableUntil": null,
    "version": 3,
    "participants": [],
    "application": {
      "id": "uuid",
      "status": "INTERVIEWING",
      "jobPost": {
        "id": "uuid",
        "title": "Backend Engineer",
        "company": { "id": "uuid", "name": "FPT Software" }
      },
      "candidateProfile": {
        "id": "uuid",
        "account": { "id": "uuid", "fullName": "Nguyễn Văn A" }
      }
    },
    "talentContactRequest": null,
    "supportCase": null
  }
}
```

**Lỗi:**

- `403 Forbidden` – Người dùng không phải participant của hội thoại.
- `404 Not Found` – Hội thoại không tồn tại.

---

### 4.3 `GET /conversations/:id/messages` – Lịch sử tin nhắn

Lấy danh sách tin nhắn của một hội thoại theo thứ tự thời gian **tăng dần** (oldest first), hỗ trợ cursor pagination ngược (tải về trước).

**Path Parameters:**
| Tham số | Kiểu | Mô tả |
|---------|------|-------|
| `id` | `string` (UUID) | ID của hội thoại |

**Query Parameters:**
| Tham số | Kiểu | Mô tả | Mặc định |
|---------|------|-------|----------|
| `before` | `string` | Cursor – lấy các tin nhắn **cũ hơn** điểm này | (tin mới nhất) |
| `limit` | `integer` [1–50] | Số lượng tin nhắn mỗi trang | `30` |

> **Ghi chú phân trang:** Server query theo `DESC` rồi `.reverse()` để trả về theo `ASC`. `meta.nextCursor` trỏ đến tin nhắn cũ nhất trong trang hiện tại – dùng làm giá trị `before` để tải trang trước đó (scroll lên).

**Response `200 OK`:**

```json
{
  "data": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "senderParticipantId": "uuid",
      "clientMessageId": "my-msg-001",
      "type": "TEXT",
      "content": "Xin chào!",
      "replyToMessageId": null,
      "systemEventType": null,
      "metadata": null,
      "deletedAt": null,
      "createdAt": "2026-07-18T00:00:00.000Z",
      "attachments": []
    }
  ],
  "meta": {
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTE4VDAwOjAwOjAwLjAwMFoiLCJpZCI6InV1aWQifQ"
  }
}
```

**Lỗi:**

- `403 Forbidden` – Không phải participant.

---

### 4.4 `POST /conversations/:id/messages` – Gửi tin nhắn

Gửi tin nhắn văn bản và/hoặc đính kèm file (đã upload trước bằng endpoint attachments) vào hội thoại.

**Path Parameters:**
| Tham số | Kiểu | Mô tả |
|---------|------|-------|
| `id` | `string` (UUID) | ID của hội thoại |

**Request Body (JSON):**

```json
{
  "clientMessageId": "my-unique-msg-id-001",
  "content": "Nội dung tin nhắn (tùy chọn nếu có attachment)",
  "attachmentIds": ["uuid1", "uuid2"],
  "replyToMessageId": "uuid-of-replied-message"
}
```

| Trường             | Kiểu                          | Bắt buộc | Mô tả                                                                                                                             |
| ------------------ | ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `clientMessageId`  | `string` (max 100 ký tự)      | Có       | ID do client tạo ra, dùng để dedup (idempotency). Nếu cùng `clientMessageId` gửi lại, server trả về tin nhắn cũ mà không tạo mới. |
| `content`          | `string` (max 4000 ký tự)     | Không    | Nội dung văn bản. Bắt buộc nếu không có `attachmentIds`.                                                                          |
| `attachmentIds`    | `string[]` (UUID[], tối đa 5) | Không    | Danh sách ID attachment đã upload. Phải thuộc conversation này và chưa được gắn vào message nào.                                  |
| `replyToMessageId` | `string` (UUID)               | Không    | ID tin nhắn muốn reply. Tin nhắn đó phải thuộc cùng conversation và chưa bị xóa.                                                  |

**Loại message tự động xác định:**

- Chỉ có `content` → `type = TEXT`
- Chỉ có `attachmentIds` → `type = ATTACHMENT`
- Có cả hai → `type = MIXED`

**Response `201 Created`:** Trả về object message vừa tạo (giống cấu trúc trong list messages).

**Lỗi:**

- `400 Bad Request` – Thiếu cả content và attachmentIds; hoặc `replyToMessageId` không hợp lệ.
- `403 Forbidden` – Không phải participant.
- `409 Conflict` – Hội thoại đang ở trạng thái không ghi được (`CONVERSATION_NOT_WRITABLE`), hoặc attachment đã được claimed.
- `429 Too Many Requests` – Vượt rate limit 30 tin/phút.

---

### 4.5 `PATCH /conversations/:id/read` – Đánh dấu đã đọc

Cập nhật vị trí đã đọc cuối cùng của người dùng trong hội thoại. Không làm gì nếu `messageId` cũ hơn vị trí đã đọc hiện tại.

**Request Body (JSON):**

```json
{
  "messageId": "uuid-of-last-read-message"
}
```

**Response `200 OK`:** Trả về participant record đã cập nhật.

**Side-effect:** Emit sự kiện `message:read` đến room WS của conversation để các participant khác biết.

---

### 4.6 `POST /conversations/:id/attachments` – Upload file đính kèm

Upload một file vào conversation. File được lưu trên Cloudinary với `delivery_type=authenticated` (URL có chữ ký, không public). Sau khi upload, dùng `attachmentId` trả về khi gọi `POST /messages`.

**Request:** `multipart/form-data`
| Field | Kiểu | Mô tả |
|-------|------|-------|
| `file` | File | File cần upload |

**Định dạng được phép:**
| MIME Type | Định dạng | Xác thực magic bytes |
|-----------|-----------|----------------------|
| `application/pdf` | PDF | `%PDF-` (5 bytes đầu) |
| `image/jpeg` | JPEG | `FF D8 FF` (3 bytes đầu) |
| `image/png` | PNG | `89 50 4E 47 0D 0A 1A 0A` (8 bytes đầu) |
| `image/webp` | WebP | `RIFF` (bytes 0-3) + `WEBP` (bytes 8-11) |

> Server kiểm tra cả MIME type lẫn magic bytes thực tế của file để chống spoofing.

**Giới hạn:** Không cho phép upload attachment trong conversation loại `TALENT_OUTREACH`.

**Response `201 Created`:**

```json
{
  "data": {
    "id": "uuid",
    "conversationId": "uuid",
    "fileAssetId": "uuid",
    "uploadedByParticipantId": "uuid",
    "status": "UPLOADED",
    "messageId": null,
    "claimedAt": null,
    "deletedAt": null,
    "createdAt": "2026-07-18T00:00:00.000Z",
    "fileAsset": {
      "id": "uuid",
      "originalName": "document.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": "286000",
      "storageKey": "conversation/uuid/attachment-xxxx.pdf",
      "publicUrl": null
    }
  }
}
```

**Vòng đời attachment:**

- `UPLOADED` – File đã upload, chưa gắn vào message nào.
- `CLAIMED` – Đã gắn vào message qua `attachmentIds` trong `POST /messages`.
- Orphan cleanup: Cron chạy **mỗi giờ** xóa các attachment ở trạng thái `UPLOADED` và không có `messageId` sau **24 giờ**.

**Lỗi:**

- `400 Bad Request` – Thiếu file.
- `403 Forbidden` – Không phải participant.
- `409 Conflict` – Conversation loại `TALENT_OUTREACH` không cho phép attachment.
- `415 Unsupported Media Type` – File không đúng định dạng hoặc magic bytes không khớp.

---

### 4.7 `GET /conversations/:id/attachments/:attachmentId/access` – Lấy URL truy cập file

Tạo URL có chữ ký (signed URL) để tải/xem file đính kèm. URL hợp lệ trong **5 phút**.

**Path Parameters:**
| Tham số | Kiểu | Mô tả |
|---------|------|-------|
| `id` | `string` (UUID) | ID của hội thoại |
| `attachmentId` | `string` (UUID) | ID của attachment |

**Điều kiện:** Attachment phải có `status = CLAIMED` và chưa bị xóa (`deletedAt = null`).

**Response `200 OK`:**

```json
{
  "data": {
    "url": "https://res.cloudinary.com/...?signature=...&expires_at=...",
    "expiresAt": "2026-07-18T00:05:00.000Z"
  }
}
```

**Lỗi:**

- `403 Forbidden` – Không phải participant.
- `404 Not Found` – Attachment không tồn tại, chưa claimed, hoặc đã bị xóa.

---

## 5. WebSocket API (/chat)

### 5.1 Kết nối & xác thực

**Endpoint:** `ws://<host>/chat` (hoặc `wss://` cho production)

**Transports hỗ trợ:** `websocket`, `polling`

**Xác thực:** Truyền JWT access token trong `auth` option khi kết nối:

```javascript
const socket = io('/chat', {
  transports: ['websocket'],
  auth: {
    token: 'Bearer eyJhbGciOiJIUzI1NiIsInR...',
    // hoặc chỉ: token: 'eyJhbGciOiJIUzI1NiIsInR...'
  },
});
```

**Sau khi kết nối thành công**, server emit:

```json
// event: "connection:ready"
{
  "schemaVersion": 1,
  "actor": { "id": "uuid", "role": "CANDIDATE" },
  "serverTime": "2026-07-18T00:00:00.000Z",
  "connectionId": "socket-id"
}
```

**Nếu token không hợp lệ**, server emit rồi ngắt kết nối ngay:

```json
// event: "auth:revoked"
{
  "schemaVersion": 1,
  "code": "AUTH_EXPIRED",
  "reason": "Authentication failed"
}
```

**Rooms tự động join sau kết nối thành công:**

- `user:{role}:{userId}` – Room cá nhân nhận notification (vd: `user:candidate:uuid`)
- (Admin thêm) `support-department:{dept}` – Room theo quyền `support:{dept}:handle`

---

### 5.2 Sự kiện Client → Server

Tất cả sự kiện đều trả về một **acknowledgement** theo format chung:

**Thành công:**

```json
{ "ok": true, "data": {}, "serverTime": "2026-07-18T00:00:00.000Z" }
```

**Thất bại:**

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Not a conversation participant",
    "retryable": false
  },
  "serverTime": "2026-07-18T00:00:00.000Z"
}
```

| `error.code`     | Retry? | Nguyên nhân                 |
| ---------------- | ------ | --------------------------- |
| `AUTH_EXPIRED`   | Không  | Token hết hạn               |
| `FORBIDDEN`      | Không  | Không có quyền truy cập     |
| `CONFLICT`       | Không  | Conversation không ghi được |
| `RATE_LIMITED`   | Có     | Vượt giới hạn tốc độ        |
| `INTERNAL_ERROR` | Có     | Lỗi server                  |

---

#### `conversation:join`

Tham gia room WebSocket của một hội thoại để nhận realtime events. **Phải gọi trước khi muốn nhận tin nhắn mới từ server.**

```javascript
socket.emit('conversation:join', { conversationId: 'uuid' }, (ack) => {
  if (ack.ok) console.log('Joined', ack.data.conversationId);
});
```

**Payload:** `{ conversationId: string }`

**Ack data:** `{ conversationId: string }`

**Điều kiện:** User phải là participant của conversation.

---

#### `conversation:leave`

Rời khỏi room WebSocket của hội thoại. Không nhận realtime events nữa.

```javascript
socket.emit('conversation:leave', { conversationId: 'uuid' }, (ack) => {});
```

**Payload:** `{ conversationId: string }`

**Ack data:** `{ conversationId: string }`

> Không cần phải là participant để leave, không có lỗi auth.

---

#### `message:send`

Gửi tin nhắn qua WebSocket. Logic giống `POST /conversations/:id/messages` nhưng realtime hơn.

```javascript
socket.emit(
  'message:send',
  {
    conversationId: 'uuid',
    clientMessageId: 'my-unique-id-001',
    content: 'Nội dung tin nhắn',
    attachmentIds: [],
    replyToMessageId: null,
  },
  (ack) => {
    if (ack.ok) console.log('Sent', ack.data);
  },
);
```

**Payload:**

```typescript
{
  conversationId: string;
  clientMessageId: string;   // max 100 ký tự, dùng để dedup
  content?: string;          // max 4000 ký tự
  attachmentIds?: string[];  // UUID[], max 5
  replyToMessageId?: string; // UUID
}
```

**Ack data:** Message object đầy đủ.

**Side-effect:** Server emit `message:created` đến room `conversation:{id}`.

---

#### `message:read`

Đánh dấu đã đọc đến một tin nhắn cụ thể, giống `PATCH /conversations/:id/read`.

```javascript
socket.emit(
  'message:read',
  {
    conversationId: 'uuid',
    messageId: 'uuid',
  },
  (ack) => {},
);
```

**Payload:** `{ conversationId: string; messageId: string }`

**Side-effect:** Server emit `message:read` đến room `conversation:{id}`.

---

#### `typing:start`

Thông báo đang gõ phím cho các participant khác. Server emit `typing:updated` với `isTyping: true` đến room. Trạng thái tự hết hạn sau **5 giây** (client phải gửi lại nếu tiếp tục gõ).

```javascript
socket.emit('typing:start', { conversationId: 'uuid' });
// Không có acknowledgement trả về
```

**Điều kiện:** User phải là participant **và** conversation phải đang ở trạng thái writable.

---

#### `typing:stop`

Thông báo đã ngừng gõ phím.

```javascript
socket.emit('typing:stop', { conversationId: 'uuid' });
```

**Điều kiện:** User phải là participant (không kiểm tra writable).

---

### 5.3 Sự kiện Server → Client

Các sự kiện server push về cho client. Không cần acknowledge.

---

#### `message:created`

Tin nhắn mới được gửi vào conversation.

**Nhận bởi:** Tất cả socket đang trong room `conversation:{conversationId}`

```json
{
  "schemaVersion": 1,
  "conversationId": "uuid",
  "message": {
    "id": "uuid",
    "conversationId": "uuid",
    "senderParticipantId": "uuid",
    "clientMessageId": "my-id-001",
    "type": "TEXT",
    "content": "Xin chào!",
    "replyToMessageId": null,
    "attachments": [],
    "createdAt": "2026-07-18T00:00:00.000Z"
  }
}
```

---

#### `message:read`

Một participant đã đọc đến vị trí mới.

**Nhận bởi:** Tất cả socket trong room `conversation:{conversationId}`

```json
{
  "schemaVersion": 1,
  "conversationId": "uuid",
  "participantId": "uuid",
  "lastReadMessageId": "uuid",
  "lastReadAt": "2026-07-18T00:00:00.000Z"
}
```

---

#### `typing:updated`

Trạng thái gõ phím của một participant thay đổi.

**Nhận bởi:** Các socket **khác** trong room `conversation:{conversationId}` (không phải người gửi)

```json
{
  "schemaVersion": 1,
  "conversationId": "uuid",
  "participantId": "uuid",
  "isTyping": true,
  "expiresAt": "2026-07-18T00:00:05.000Z"
}
```

> Nếu `isTyping: true`, client nên tự xóa trạng thái typing khi `expiresAt` đến (dự phòng trường hợp `typing:stop` không được gửi).

---

#### `connection:ready`

Kết nối thành công, server gửi thông tin khởi tạo. Xem [mục 5.1](#51-kết-nối--xác-thực).

---

#### `auth:revoked`

Token không hợp lệ, server sẽ ngắt kết nối sau khi emit event này.

```json
{
  "schemaVersion": 1,
  "code": "AUTH_EXPIRED",
  "reason": "Authentication failed"
}
```

---

## 6. Cấu trúc dữ liệu chung

### ConversationParticipant

```typescript
{
  id: string;
  role: 'CANDIDATE' | 'RECRUITER' | 'ADMIN' | 'SUPPORT';
  lastReadAt: string | null;        // ISO datetime
  candidateAccount: {
    id: string;
    fullName: string;
  } | null;
  recruiterAccount: {
    id: string;
    profile: { fullName: string; avatarUrl: string | null };
    company: { id: string; name: string };
  } | null;
  adminUser: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
}
```

### Message

```typescript
{
  id: string;
  conversationId: string;
  senderParticipantId: string | null;  // null nếu là SYSTEM message
  clientMessageId: string | null;
  type: 'TEXT' | 'ATTACHMENT' | 'MIXED' | 'SYSTEM';
  content: string | null;
  replyToMessageId: string | null;
  systemEventType: string | null;      // chỉ có khi type = SYSTEM
  metadata: object | null;             // chỉ có khi type = SYSTEM
  deletedAt: string | null;
  createdAt: string;                   // ISO datetime
  attachments: MessageAttachment[];
}
```

### MessageAttachment (trong response messages)

```typescript
{
  id: string;
  status: 'UPLOADED' | 'CLAIMED';
  fileAsset: {
    originalName: string;
    mimeType: string;
    sizeBytes: string; // string vì BigInt serialization
  }
}
```

### System Messages (tự động tạo bởi server)

| `systemEventType`                | Nội dung                                       | Khi nào                                        |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `APPLICATION_CHAT_OPENED`        | "Hội thoại ứng tuyển đã được mở."              | Conversation APPLICATION_CHAT được tạo lần đầu |
| `APPLICATION_CHAT_REOPENED`      | "Hội thoại ứng tuyển đã được mở."              | Conversation được reactivate                   |
| `APPLICATION_CHAT_GRACE_STARTED` | "Hội thoại sẽ chuyển sang chỉ đọc sau 7 ngày." | Application bị reject hoặc candidate rút đơn   |
| `CONVERSATION_READ_ONLY`         | "Hội thoại đã chuyển sang chế độ chỉ đọc."     | Hết grace period, cron đổi trạng thái          |

---

## 7. Phân quyền truy cập

Mỗi user chỉ thấy conversation mà họ là **participant** (`leftAt = null`). Server kiểm tra qua `ConversationPolicyService.assertAccess()`:

| Actor       | Điều kiện participant          |
| ----------- | ------------------------------ |
| `CANDIDATE` | `candidateAccountId = user.id` |
| `RECRUITER` | `recruiterAccountId = user.id` |
| `ADMIN`     | `adminUserId = user.id`        |

**Participant được thêm tự động** khi conversation tạo:

- `APPLICATION_CHAT`: candidate từ application + recruiter(s) được assign (hoặc người tạo job nếu chưa assign).
- `TALENT_OUTREACH`: recruiter gửi outreach + candidate nhận.
- `SUPPORT`: recruiter tạo case + admin support được assign.

---

## 8. Rate Limiting & Giới hạn

| Giới hạn                  | Giá trị              | Áp dụng cho                            |
| ------------------------- | -------------------- | -------------------------------------- |
| Tin nhắn tối đa/phút      | **30 tin**           | Mỗi participant trong một conversation |
| Attachment tối đa/message | **5 file**           | Mỗi lần gửi (`attachmentIds`)          |
| Nội dung tin nhắn         | **4000 ký tự**       | `content` field                        |
| `clientMessageId`         | **100 ký tự**        | Dùng để đảm bảo idempotency            |
| Attachment formats        | PDF, JPEG, PNG, WebP | Kiểm tra cả MIME type và magic bytes   |
| Attachment URL TTL        | **5 phút**           | Signed URL từ access endpoint          |
| Orphan attachment cleanup | Sau **24 giờ**       | Cron mỗi giờ                           |
| Grace period khi close    | **7 ngày**           | Sau khi application reject/withdraw    |
| Expiration check          | Mỗi **1 phút**       | Cron `ConversationExpirationService`   |

---

## 9. Cơ chế Cursor Pagination

Cả danh sách conversation lẫn danh sách messages đều dùng cursor-based pagination thay vì offset.

**Cursor là base64url của JSON:**

```json
{ "createdAt": "2026-07-18T00:00:00.000Z", "id": "uuid" }
```

**Điều kiện WHERE tương đương:**

```sql
WHERE (updatedAt < cursor.createdAt)
   OR (updatedAt = cursor.createdAt AND id < cursor.id)
```

**Ví dụ dùng cursor:**

```javascript
// Trang 1 – conversations
const res1 = await fetch('/conversations?limit=20');
const { data, meta } = await res1.json();

// Trang 2 (nếu có)
if (meta.nextCursor) {
  const res2 = await fetch(`/conversations?limit=20&cursor=${meta.nextCursor}`);
}

// Tải tin nhắn mới nhất
const msgs = await fetch('/conversations/uuid/messages?limit=30');
const { meta: msgMeta } = await msgs.json();

// Scroll up – tải tin nhắn cũ hơn
if (msgMeta.nextCursor) {
  const older = await fetch(`/conversations/uuid/messages?before=${msgMeta.nextCursor}`);
}
```

---

## 10. Biến môi trường bật/tắt tính năng

Ba loại conversation có thể bật/tắt độc lập trong `.env`:

```env
# Bật chat trong đơn ứng tuyển (APPLICATION_CHAT)
# Conversation tự động tạo ngay khi candidate nộp hồ sơ thành công (SUBMITTED)
CHAT_APPLICATION_ENABLED=false

# Bật chat outreach (TALENT_OUTREACH)
# Recruiter chủ động nhắn tin candidate không qua application
CHAT_OUTREACH_ENABLED=false

# Bật chat hỗ trợ (SUPPORT)
# Recruiter tạo support case và chat với admin
CHAT_SUPPORT_ENABLED=false
```

Khi một feature flag là `false`, các service lifecycle tương ứng sẽ **không tạo conversation mới**, nhưng các conversation đã tồn tại vẫn có thể truy cập bình thường qua REST và WebSocket API.
