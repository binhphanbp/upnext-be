# BẢNG THÔNG TIN KIỂU DỮ LIỆU CÁC BẢNG TRONG DATABASE (SCHEMA)

Tài liệu chi tiết kiểu dữ liệu, ràng buộc và mô tả của **4 bảng dữ liệu** theo chuẩn Database PostgreSQL & Prisma Schema.

---

## 1. Phiên bản CV — `cv_versions`

| Tên cột              | Kiểu dữ liệu | Ràng buộc                            | Ghi chú                                         |
| -------------------- | ------------ | ------------------------------------ | ----------------------------------------------- |
| **`id`**             | `UUID`       | **PK**, `NOT NULL`, `DEFAULT uuid()` | Mã phiên bản CV                                 |
| **`source_file_id`** | `UUID`       | **FK1**, `NULLABLE`                  | Mã tệp tin đính kèm (liên kết `file_assets.id`) |
| **`cv_id`**          | `UUID`       | **FK2**, `NOT NULL`                  | Mã hồ sơ CV gốc (liên kết `cvs.id`)             |
| **`template_id`**    | `UUID`       | **FK3**, `NULLABLE`                  | Mã mẫu thiết kế (liên kết `cv_templates.id`)    |
| **`version_no`**     | `INT`        | `NOT NULL`                           | Số thứ tự phiên bản (tăng dần 1, 2, 3...)       |
| **`content_json`**   | `JSON`       | `NULLABLE`                           | Nội dung CV dạng thiết kế Online (JSON)         |
| **`parsed_text`**    | `TEXT`       | `NULLABLE`                           | Văn bản được trích xuất từ CV                   |
| **`created_at`**     | `TIMESTAMP`  | `NOT NULL`, `DEFAULT now()`          | Thời điểm tạo phiên bản                         |

---

## 2. Ứng tuyển — `applications`

| Tên cột                    | Kiểu dữ liệu | Ràng buộc                            | Ghi chú                                                                                                                                 |
| -------------------------- | ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`id`**                   | `UUID`       | **PK**, `NOT NULL`, `DEFAULT uuid()` | Mã đơn ứng tuyển                                                                                                                        |
| **`job_post_id`**          | `UUID`       | **FK1**, `NOT NULL`                  | Mã tin tuyển dụng (liên kết `job_posts.id`)                                                                                             |
| **`candidate_profile_id`** | `UUID`       | **FK2**, `NOT NULL`                  | Mã hồ sơ ứng viên (liên kết `candidate_profiles.id`)                                                                                    |
| **`cv_version_id`**        | `UUID`       | **FK3**, `NOT NULL`                  | Mã phiên bản CV nộp (liên kết `cv_versions.id`)                                                                                         |
| **`cover_letter`**         | `TEXT`       | `NULLABLE`                           | Thư giới thiệu của ứng viên                                                                                                             |
| **`status`**               | `ENUM`       | `NOT NULL`, `DEFAULT 'SUBMITTED'`    | Trạng thái ứng tuyển (`SUBMITTED`, `VIEWED`, `CONSIDERING`, `SHORTLISTED`, `INTERVIEWING`, `OFFERED`, `HIRED`, `WITHDRAWN`, `REJECTED`) |
| **`submitted_at`**         | `TIMESTAMP`  | `NOT NULL`, `DEFAULT now()`          | Thời điểm nộp đơn                                                                                                                       |
| **`viewed_at`**            | `TIMESTAMP`  | `NULLABLE`                           | Thời điểm nhà tuyển dụng xem đơn                                                                                                        |
| **`rejected_at`**          | `TIMESTAMP`  | `NULLABLE`                           | Thời điểm bị từ chối                                                                                                                    |
| **`hired_at`**             | `TIMESTAMP`  | `NULLABLE`                           | Thời điểm được nhận làm                                                                                                                 |
| **`created_at`**           | `TIMESTAMP`  | `NOT NULL`, `DEFAULT now()`          | Thời điểm tạo đơn                                                                                                                       |
| **`updated_at`**           | `TIMESTAMP`  | `NOT NULL`                           | Thời điểm cập nhật cuối                                                                                                                 |
| **`version`**              | `INT`        | `NOT NULL`, `DEFAULT 0`              | Khóa phiên bản cập nhật (Optimistic lock)                                                                                               |

---

## 3. Nhật ký điểm uy tín công ty — `company_reputation_activities`

| Tên cột           | Kiểu dữ liệu   | Ràng buộc                            | Ghi chú                                 |
| ----------------- | -------------- | ------------------------------------ | --------------------------------------- |
| **`id`**          | `UUID`         | **PK**, `NOT NULL`, `DEFAULT uuid()` | Mã nhật ký điểm uy tín                  |
| **`reason`**      | `TEXT`         | `NULLABLE`                           | Lý do thay đổi điểm uy tín              |
| **`company_id`**  | `UUID`         | **FK1**, `NOT NULL`                  | Mã công ty (liên kết `companies.id`)    |
| **`action_type`** | `VARCHAR(80)`  | `NOT NULL`                           | Loại hành động tác động uy tín          |
| **`score`**       | `DECIMAL(6,2)` | `NOT NULL`                           | Số điểm thay đổi (ví dụ: +5.00, -10.00) |
| **`by_admin_id`** | `UUID`         | **FK2**, `NULLABLE`                  | Mã Admin thực hiện (nếu do Admin)       |
| **`created_at`**  | `TIMESTAMP`    | `NOT NULL`, `DEFAULT now()`          | Thời điểm ghi nhận                      |

---

## 4. Nhu cầu công việc ứng viên — `candidate_job_preferences`

| Tên cột                    | Kiểu dữ liệu    | Ràng buộc                            | Ghi chú                                                          |
| -------------------------- | --------------- | ------------------------------------ | ---------------------------------------------------------------- |
| **`id`**                   | `UUID`          | **PK**, `NOT NULL`, `DEFAULT uuid()` | Mã nhu cầu công việc                                             |
| **`candidate_profile_id`** | `UUID`          | **FK1**, `UNIQUE`, `NOT NULL`        | Mã hồ sơ ứng viên (liên kết `candidate_profiles.id`)             |
| **`desired_position`**     | `VARCHAR(150)`  | `NULLABLE`                           | Vị trí công việc mong muốn                                       |
| **`desired_salary_min`**   | `DECIMAL(12,2)` | `NULLABLE`                           | Mức lương tối thiểu mong muốn                                    |
| **`desired_salary_max`**   | `DECIMAL(12,2)` | `NULLABLE`                           | Mức lương tối đa mong muốn                                       |
| **`salary_currency`**      | `VARCHAR(10)`   | `NOT NULL`, `DEFAULT 'VND'`          | Đơn vị tiền tệ (`VND`, `USD`...)                                 |
| **`working_model`**        | `ENUM`          | `NULLABLE`                           | Hình thức làm việc (`AT_OFFICE`, `HYBRID`, `REMOTE`, `FLEXIBLE`) |
| **`desired_level_id`**     | `UUID`          | `FK2`, `NULLABLE`                    | Mã cấp bậc mong muốn (liên kết `experience_levels.id`)           |
| **`notice_period_days`**   | `INT`           | `NULLABLE`                           | Số ngày báo trước khi nhận việc                                  |
| **`is_relocate`**          | `BOOLEAN`       | `NOT NULL`, `DEFAULT false`          | Sẵn sàng chuyển vị trí công tác                                  |
| **`created_at`**           | `TIMESTAMP`     | `NOT NULL`, `DEFAULT now()`          | Thời điểm tạo                                                    |
| **`updated_at`**           | `TIMESTAMP`     | `NOT NULL`                           | Thời điểm cập nhật                                               |
