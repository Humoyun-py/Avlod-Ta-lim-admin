import {
  User,
  Course,
  Teacher,
  Group,
  Student,
  Payment,
  ShopProduct,
  ShopOrder,
  NotificationItem,
  DashboardData,
  StudentCredentials,
} from '../types';

const API_BASE = '/api/v1';

class ApiService {
  private accessToken: string | null = null;
  private refreshTokenVal: string | null = null;

  constructor() {
    this.accessToken = sessionStorage.getItem('avlod_access_token');
    this.refreshTokenVal = sessionStorage.getItem('avlod_refresh_token');
  }

  public setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshTokenVal = refresh;
    sessionStorage.setItem('avlod_access_token', access);
    sessionStorage.setItem('avlod_refresh_token', refresh);
  }

  public clearTokens() {
    this.accessToken = null;
    this.refreshTokenVal = null;
    sessionStorage.removeItem('avlod_access_token');
    sessionStorage.removeItem('avlod_refresh_token');
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    let response = await fetch(url, { ...options, headers });

    // Handle token expiration
    if (response.status === 401 && this.refreshTokenVal && !endpoint.includes('/auth/refresh/')) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        response = await fetch(url, { ...options, headers });
      }
    }

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { detail: response.statusText || 'An unexpected error occurred.' };
      }
      const message = errorData.detail || errorData.message || (typeof errorData === 'string' ? errorData : 'Request failed');
      const error: any = new Error(message);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }

    return response.json();
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshTokenVal) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: this.refreshTokenVal }),
      });
      if (!res.ok) {
        this.clearTokens();
        return false;
      }
      const data = await res.json();
      if (data.access) {
        this.accessToken = data.access;
        sessionStorage.setItem('avlod_access_token', data.access);
        return true;
      }
      return false;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  // ---------------- AUTH ----------------
  async loginStaff(username: string, password: string): Promise<{ access: string; refresh: string; user: User }> {
    const data = await this.request<{ access: string; refresh: string; user: User }>('/auth/staff/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setTokens(data.access, data.refresh);
    return data;
  }

  async loginStudent(student_id: string, password: string): Promise<{ access: string; refresh: string; user: User }> {
    const data = await this.request<{ access: string; refresh: string; user: User }>('/auth/student/login/', {
      method: 'POST',
      body: JSON.stringify({ student_id, password }),
    });
    this.setTokens(data.access, data.refresh);
    return data;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me/');
  }

  async updateProfile(profileData: { full_name?: string; email?: string; phone?: string }): Promise<User> {
    return this.request<User>('/auth/profile/', {
      method: 'PATCH',
      body: JSON.stringify(profileData),
    });
  }

  async changePassword(old_password: string, new_password: string): Promise<{ detail: string }> {
    return this.request<{ detail: string }>('/auth/change-password/', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    });
  }

  // ---------------- DASHBOARD ----------------
  async getAdminDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>('/dashboard/admin/');
  }

  // ---------------- COURSES ----------------
  async getCourses(params?: { search?: string; status?: string }): Promise<{ count: number; results: Course[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    return this.request<{ count: number; results: Course[] }>(`/courses/?${query.toString()}`);
  }

  async createCourse(courseData: Partial<Course>): Promise<Course> {
    return this.request<Course>('/courses/', {
      method: 'POST',
      body: JSON.stringify(courseData),
    });
  }

  async getCourse(id: string): Promise<Course> {
    return this.request<Course>(`/courses/${id}/`);
  }

  async updateCourse(id: string, courseData: Partial<Course>): Promise<Course> {
    return this.request<Course>(`/courses/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(courseData),
    });
  }

  // ---------------- TEACHERS ----------------
  async getTeachers(): Promise<{ count: number; results: Teacher[] }> {
    return this.request<{ count: number; results: Teacher[] }>('/teachers/');
  }

  // ---------------- STUDENTS ----------------
  async getStudents(params?: {
    search?: string;
    course_id?: string;
    group_id?: string;
    payment_status?: string;
    account_status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ count: number; page: number; page_size: number; total_pages: number; results: Student[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.course_id) query.append('course_id', params.course_id);
    if (params?.group_id) query.append('group_id', params.group_id);
    if (params?.payment_status) query.append('payment_status', params.payment_status);
    if (params?.account_status) query.append('account_status', params.account_status);
    if (params?.page) query.append('page', params.page.toString());
    if (params?.page_size) query.append('page_size', params.page_size.toString());
    return this.request(`/students/?${query.toString()}`);
  }

  async createStudent(payload: {
    first_name: string;
    last_name: string;
    phone?: string;
    course_id: string;
    group_id?: string;
    monthly_fee?: number;
  }): Promise<{ student: Student; credentials: StudentCredentials }> {
    return this.request<{ student: Student; credentials: StudentCredentials }>('/students/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getStudent(id: string): Promise<Student> {
    return this.request<Student>(`/students/${id}/`);
  }

  async updateStudent(id: string, payload: Partial<Student>): Promise<Student> {
    return this.request<Student>(`/students/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async overrideStudentStatus(id: string, action: 'activate' | 'restrict' | 'deactivate', audit_reason: string): Promise<{ student: Student; message: string }> {
    return this.request<{ student: Student; message: string }>(`/students/${id}/override-status/`, {
      method: 'POST',
      body: JSON.stringify({ action, audit_reason }),
    });
  }

  // ---------------- GROUPS ----------------
  async getGroups(params?: { search?: string; course_id?: string; teacher_id?: string; status?: string }): Promise<{ count: number; results: Group[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.course_id) query.append('course_id', params.course_id);
    if (params?.teacher_id) query.append('teacher_id', params.teacher_id);
    if (params?.status) query.append('status', params.status);
    return this.request<{ count: number; results: Group[] }>(`/groups/?${query.toString()}`);
  }

  async createGroup(payload: {
    name: string;
    course_id: string;
    teacher_id: string;
    student_ids: string[];
    start_date: string;
    schedule: string;
  }): Promise<Group> {
    return this.request<Group>('/groups/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getGroup(id: string): Promise<Group & { students: Student[] }> {
    return this.request<Group & { students: Student[] }>(`/groups/${id}/`);
  }

  async updateGroup(id: string, payload: Partial<Group>): Promise<Group> {
    return this.request<Group>(`/groups/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async addStudentsToGroup(groupId: string, studentIds: string[]): Promise<{ group_id: string; enrolled_count: number; detail: string }> {
    return this.request<{ group_id: string; enrolled_count: number; detail: string }>(`/groups/${groupId}/students/`, {
      method: 'POST',
      body: JSON.stringify({ student_ids: studentIds }),
    });
  }

  async removeStudentFromGroup(groupId: string, studentId: string): Promise<{ detail: string }> {
    return this.request<{ detail: string }>(`/groups/${groupId}/students/${studentId}`, {
      method: 'DELETE',
    });
  }

  // ---------------- PAYMENTS ----------------
  async getPayments(params?: {
    search?: string;
    student_id?: string;
    method?: string;
    verification_status?: string;
  }): Promise<{ count: number; results: Payment[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.student_id) query.append('student_id', params.student_id);
    if (params?.method) query.append('method', params.method);
    if (params?.verification_status) query.append('verification_status', params.verification_status);
    return this.request<{ count: number; results: Payment[] }>(`/payments/?${query.toString()}`);
  }

  async getPendingVerifications(): Promise<{ count: number; results: Payment[] }> {
    return this.request<{ count: number; results: Payment[] }>('/payments/verification-queue/');
  }

  async registerPayment(payload: {
    student_id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    note?: string;
    receipt_url?: string | null;
  }): Promise<Payment> {
    return this.request<Payment>('/payments/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async verifyPayment(id: string, action: 'approve' | 'reject', reason?: string): Promise<{ payment: Payment; student?: Student }> {
    return this.request<{ payment: Payment; student?: Student }>(`/payments/${id}/verify/`, {
      method: 'PATCH',
      body: JSON.stringify({ action, reason }),
    });
  }

  // ---------------- SHOP ----------------
  async getProducts(params?: { search?: string }): Promise<{ count: number; results: ShopProduct[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    return this.request<{ count: number; results: ShopProduct[] }>(`/shop/products/?${query.toString()}`);
  }

  async createProduct(payload: Partial<ShopProduct>): Promise<ShopProduct> {
    return this.request<ShopProduct>('/shop/products/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateProduct(id: string, payload: Partial<ShopProduct>): Promise<ShopProduct> {
    return this.request<ShopProduct>(`/shop/products/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async getShopOrders(params?: { search?: string; status?: string }): Promise<{ count: number; results: ShopOrder[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    return this.request<{ count: number; results: ShopOrder[] }>(`/shop/orders/?${query.toString()}`);
  }

  async updateOrderStatus(id: string, status: string, admin_notes?: string): Promise<ShopOrder> {
    return this.request<ShopOrder>(`/shop/orders/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status, admin_notes }),
    });
  }

  // ---------------- NOTIFICATIONS ----------------
  async getNotifications(): Promise<{ count: number; unread_count: number; results: NotificationItem[] }> {
    return this.request<{ count: number; unread_count: number; results: NotificationItem[] }>('/notifications/');
  }

  async markNotificationRead(id: string): Promise<{ detail: string }> {
    return this.request<{ detail: string }>(`/notifications/${id}/read/`, {
      method: 'PATCH',
    });
  }

  async markAllNotificationsRead(): Promise<{ detail: string }> {
    return this.request<{ detail: string }>('/notifications/mark-all-read/', {
      method: 'POST',
    });
  }

  // ---------------- FILE UPLOADS ----------------
  async uploadFile(file: File): Promise<{ url: string; filename: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.request<{ url: string; filename: string; size: number }>('/uploads/', {
      method: 'POST',
      body: formData,
    });
  }
}

export const api = new ApiService();
