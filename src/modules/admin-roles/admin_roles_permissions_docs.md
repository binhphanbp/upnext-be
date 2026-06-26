# Tài liệu API & Hướng dẫn Tích hợp: Admin Roles & Permissions

Tài liệu này cung cấp chi tiết về cách hoạt động, các Endpoint API, cấu trúc Request/Response và hướng dẫn tích hợp chi tiết dành cho Frontend (FE) đối với hệ thống vai trò & phân quyền động dành cho Admin.

---

## 1. Cơ chế Hoạt động (Tổng quan cho FE)

1. **Đăng nhập & Nhận Role**: Khi Admin đăng nhập thành công, token JWT trả về cho FE sẽ chứa thông tin `adminRoleId`.
2. **Kiểm tra quyền ở FE (Ẩn/Hiện UI)**:
   - FE gọi API lấy chi tiết vai trò của Admin hiện tại để lấy danh sách các mã quyền hạn (`permissionCode`).
   - FE lưu danh sách mã quyền này vào State (ví dụ: `['posts:read', 'posts:write', 'reports:read']`).
   - Sử dụng danh sách này để ẩn/hiện các nút bấm (ví dụ: Nút "Xóa bài viết" chỉ hiện khi có quyền `'posts:write'`).
3. **Kiểm tra quyền ở BE (Bảo mật API)**:
   - Khi FE gửi request API, Guard ở phía BE sẽ lấy `adminRoleId` từ token, đối chiếu danh sách quyền của Role đó trong Database để cho phép hoặc chặn request.
   - Nếu bị chặn, BE trả về mã lỗi `403 Forbidden` kèm thông báo: `"Bạn không có quyền thực hiện hành động này!"`.

---

## 2. API Vai trò Admin (`/admin/roles`)

### 2.1. Lấy danh sách vai trò
* **Endpoint**: `GET /admin/roles`
* **Quyền yêu cầu**: `roles:read`
* **Mô tả**: Trả về tất cả vai trò admin trong hệ thống kèm theo danh sách các quyền đã gán cho vai trò đó.

**Response Example (200 OK)**:
```json
[
  {
    "id": "e6f8832c-3bb1-41e1-95ef-cb3e7f4b8cfd",
    "roleName": "moderator",
    "description": "Quản trị viên duyệt bài viết và báo cáo",
    "status": "ACTIVE",
    "createdAt": "2026-06-26T16:15:58.000Z",
    "updatedAt": "2026-06-26T16:15:58.000Z",
    "rolePermissions": [
      {
        "id": "d04a622a-0a79-4bc7-b8a7-5c20cb7974e1",
        "roleId": "e6f8832c-3bb1-41e1-95ef-cb3e7f4b8cfd",
        "permissionId": "a90df2fa-b054-47f9-813d-82d8d85f8cfb",
        "permission": {
          "id": "a90df2fa-b054-47f9-813d-82d8d85f8cfb",
          "permissionName": "Xem bài viết",
          "permissionCode": "posts:read",
          "module": "posts",
          "description": "Cho phép xem các bài viết blog/news"
        }
      }
    ]
  }
]
```

---

### 2.2. Xem chi tiết vai trò
* **Endpoint**: `GET /admin/roles/{id}`
* **Quyền yêu cầu**: `roles:read`
* **Mô tả**: Lấy thông tin chi tiết của một vai trò dựa trên UUID, kèm danh sách quyền hạn cụ thể.

**Response Example (200 OK)**:
```json
{
  "id": "e6f8832c-3bb1-41e1-95ef-cb3e7f4b8cfd",
  "roleName": "moderator",
  "description": "Quản trị viên duyệt bài viết và báo cáo",
  "status": "ACTIVE",
  "createdAt": "2026-06-26T16:15:58.000Z",
  "updatedAt": "2026-06-26T16:15:58.000Z",
  "rolePermissions": [
    {
      "permission": {
        "id": "a90df2fa-b054-47f9-813d-82d8d85f8cfb",
        "permissionName": "Xem bài viết",
        "permissionCode": "posts:read",
        "module": "posts"
      }
    }
  ]
}
```

---

### 2.3. Tạo vai trò mới
* **Endpoint**: `POST /admin/roles`
* **Quyền yêu cầu**: `roles:write`

**Request Body**:
```json
{
  "roleName": "content_creator",
  "description": "Chuyên viên viết bài viết",
  "status": "ACTIVE"
}
```

**Response Example (201 Created)**:
```json
{
  "id": "782f9d50-59f7-4aeb-a02b-586b4129b015",
  "roleName": "content_creator",
  "description": "Chuyên viên viết bài viết",
  "status": "ACTIVE",
  "createdByAdminId": "admin-uuid-here",
  "createdAt": "2026-06-26T23:30:00.000Z",
  "updatedAt": "2026-06-26T23:30:00.000Z"
}
```

---

### 2.4. Cập nhật vai trò
* **Endpoint**: `PATCH /admin/roles/{id}`
* **Quyền yêu cầu**: `roles:write`

**Request Body (Truyền các trường cần cập nhật)**:
```json
{
  "description": "Vai trò mới cho bộ phận Content",
  "status": "INACTIVE"
}
```

**Response Example (200 OK)**:
```json
{
  "id": "782f9d50-59f7-4aeb-a02b-586b4129b015",
  "roleName": "content_creator",
  "description": "Vai trò mới cho bộ phận Content",
  "status": "INACTIVE",
  "updatedAt": "2026-06-26T23:31:00.000Z"
}
```

---

### 2.5. Xóa vai trò
* **Endpoint**: `DELETE /admin/roles/{id}`
* **Quyền yêu cầu**: `roles:write`
* **Mô tả**: Xóa vai trò chỉ khi **không có** tài khoản admin nào đang được gán vai trò này.
* **Response**: `204 No Content` (Thành công, không có body trả về).

---

### 2.6. Gán quyền hạn vào vai trò (Đồng bộ)
* **Endpoint**: `POST /admin/roles/{id}/permissions`
* **Quyền yêu cầu**: `roles:write`
* **Mô tả**: Gửi lên danh sách các UUID của quyền hạn mà bạn muốn gán cho vai trò này. API sẽ tự động **xóa bỏ** các quyền cũ không được gửi lên và **thêm mới** các quyền được gửi lên.

**Request Body**:
```json
{
  "permissionIds": [
    "a90df2fa-b054-47f9-813d-82d8d85f8cfb",
    "f231e345-cb3e-4fb7-8821-2e656d05f340"
  ]
}
```

**Response Example (200 OK)**:
*Trả về thông tin vai trò cập nhật kèm toàn bộ danh sách các quyền hạn mới sau khi đồng bộ.*

---

## 3. API Quyền hạn Admin (`/admin/permissions`)

### 3.1. Lấy danh sách tất cả quyền hạn
* **Endpoint**: `GET /admin/permissions`
* **Quyền yêu cầu**: `permissions:read`
* **Mô tả**: Lấy toàn bộ danh sách quyền hạn hiện có trong hệ thống để phục vụ giao diện gán quyền dạng Checkbox hoặc Select.

**Response Example (200 OK)**:
```json
[
  {
    "id": "a90df2fa-b054-47f9-813d-82d8d85f8cfb",
    "permissionName": "Xem bài viết",
    "permissionCode": "posts:read",
    "module": "posts",
    "description": "Cho phép xem các bài viết blog/news",
    "createdAt": "2026-06-26T16:15:58.000Z",
    "updatedAt": "2026-06-26T16:15:58.000Z"
  },
  {
    "id": "f231e345-cb3e-4fb7-8821-2e656d05f340",
    "permissionName": "Quản lý bài viết",
    "permissionCode": "posts:write",
    "module": "posts",
    "description": "Cho phép tạo, sửa, xóa bài viết blog/news",
    "createdAt": "2026-06-26T16:15:58.000Z",
    "updatedAt": "2026-06-26T16:15:58.000Z"
  }
]
```

---

### 3.2. Tạo quyền hạn mới
* **Endpoint**: `POST /admin/permissions`
* **Quyền yêu cầu**: `permissions:write`

**Request Body**:
```json
{
  "permissionName": "Xóa hoàn toàn người dùng",
  "permissionCode": "users:hard_delete",
  "module": "users",
  "description": "Quyền tối cao xóa tài khoản khỏi CSDL"
}
```

---

## 4. Hướng dẫn Tích hợp phía Frontend (FE Integration)

### Bước 1: Lưu danh sách quyền của Admin sau khi Đăng nhập
Khi người dùng đăng nhập thành công:
1. Lấy ra `adminRoleId` của họ từ payload token JWT.
2. Gọi API `GET /admin/roles/{adminRoleId}` để nhận thông tin chi tiết vai trò của họ.
3. Trích xuất danh sách các `permissionCode` và lưu vào Context hoặc Global State (Redux / Pinia / React Context):

```javascript
// Ví dụ xử lý JS
const permissions = roleDetail.rolePermissions.map(rp => rp.permission.permissionCode);
// Kết quả: ['roles:read', 'posts:read', 'posts:write']
localStorage.setItem('admin_permissions', JSON.stringify(permissions));
```

### Bước 2: Tạo Component hoặc Hook kiểm tra quyền trên UI
Tạo một helper function hoặc component bao bọc để hiển thị/ẩn các nút bấm tương ứng:

**Ví dụ trong React**:
```jsx
// Hook kiểm tra quyền
export function usePermission() {
  const permissions = JSON.parse(localStorage.getItem('admin_permissions') || '[]');
  
  const hasPermission = (code) => {
    // Nếu là super_admin (bỏ qua kiểm tra)
    const roleName = localStorage.getItem('admin_role_name');
    if (roleName === 'super_admin') return true;

    return permissions.includes(code);
  };

  return { hasPermission };
}

// Cách sử dụng trong Component hiển thị bài viết
import { usePermission } from './hooks/usePermission';

function PostItem({ post }) {
  const { hasPermission } = usePermission();

  return (
    <div>
      <h3>{post.title}</h3>
      
      {/* Chỉ hiện nút sửa khi có quyền 'posts:write' */}
      {hasPermission('posts:write') && (
        <button onClick={handleEdit}>Sửa bài viết</button>
      )}
      
      {/* Chỉ hiện nút xóa khi có quyền 'posts:write' */}
      {hasPermission('posts:write') && (
        <button onClick={handleDelete}>Xóa bài viết</button>
      )}
    </div>
  );
}
```

### Bước 3: Xử lý lỗi API bị từ chối (403 Forbidden)
Khi gửi request API lên BE mà tài khoản đó vừa bị Admin khác thu hồi quyền:
- BE sẽ trả về status `403 Forbidden`.
- FE nên có một bộ lọc đánh chặn (Axios Interceptors) để phát hiện lỗi `403` và hiển thị thông báo Alert cảnh báo cho người dùng:

```javascript
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 403) {
      toast.error("Bạn không có quyền thực hiện hành động này hoặc quyền hạn của bạn đã bị thay đổi!");
    }
    return Promise.reject(error);
  }
);
```
