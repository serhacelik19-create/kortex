import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';



// Axios instance with auto-token injection and cookie support
const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true // Çerezleri (HttpOnly Cookies) otomatik gönderip almak için
});

// CSRF Koruması: Backend, çerezli istek geldiğinde bu başlığı zorunlu tutacak.
axiosInstance.defaults.headers.common['X-Panel-Request'] = 'true';

// Kimlik doğrulama öncelikle HttpOnly Cookie üzerinden yapılır, ancak mobil cihazlarda 
// Third-Party Cookie engellemelerine (ITP vb) karşı Authorization Header fallback eklenmiştir.
axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 401 hatası alınca otomatik logout (Login ekranındaki hatalı şifre uyarılarını silmemesi için orası hariç tutulur)
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const isLoginRequest = error.config?.url?.endsWith('/login');

        if (error.response?.status === 401 && !isLoginRequest) {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            try {
                await axios.post(`${API_BASE_URL}/logout`, {}, { withCredentials: true });
            } catch (e) {
                console.error('Logout error', e);
            }
            window.location.href = '/login'; // Login ekranına yönlendir
        }
        return Promise.reject(error);
    }
);

export const api = {
    baseUrl: API_BASE_URL,
    logout: async () => {
        try {
            await axiosInstance.post('/logout', {});
        } catch (e) { }
    },
    login: async (credentials: any) => {
        const response = await axiosInstance.post('/login', credentials);
        return response.data;
    },
    getUsers: async () => {
        const response = await axiosInstance.get('/users');
        return response.data;
    },
    createUser: async (user: any) => {
        const response = await axiosInstance.post('/users', user);
        return response.data;
    },
    deleteUser: async (id: number) => {
        await axiosInstance.delete(`/users/${id}`);
    },
    updateUser: async (id: number, user: any) => {
        const response = await axiosInstance.put(`/users/${id}`, user);
        return response.data;
    },
    getStudents: async () => {
        const response = await axiosInstance.get('/students');
        return response.data;
    },
    getAverages: async () => {
        const response = await axiosInstance.get('/subject-averages');
        return response.data;
    },
    createStudent: async (studentData: any) => {
        const response = await axiosInstance.post('/students', studentData);
        return response.data;
    },
    updateStudent: async (id: number, studentData: any) => {
        const response = await axiosInstance.put(`/students/${id}`, studentData);
        return response.data;
    },
    deleteStudent: async (id: number) => {
        const response = await axiosInstance.delete(`/students/${id}`);
        return response.data;
    },
    getStudentExams: async (id: number) => {
        const response = await axiosInstance.get(`/students/${id}/exams`);
        return response.data;
    },
    getStudentAssignedContents: async (id: number) => {
        const response = await axiosInstance.get(`/students/${id}/assigned-contents`);
        return response.data;
    },
    getStudentById: async (id: number) => {
        const response = await axiosInstance.get(`/students/${id}`);
        return response.data;
    },
    getStudentWeeklyReport: async (id: number) => {
        const response = await axiosInstance.get(`/students/${id}/weekly-report`);
        return response.data;
    },
    updateStudentAi: async (id: number, field?: string, template?: string) => {
        const response = await axiosInstance.post(`/students/${id}/ai-update`, { field, template });
        return response.data;
    },
    getClasses: async () => {
        const response = await axiosInstance.get('/classes');
        return response.data;
    },
    createClass: async (classData: { name: string }) => {
        const response = await axiosInstance.post('/classes', classData);
        return response.data;
    },
    updateClass: async (oldName: string, classData: { newName: string }) => {
        const response = await axiosInstance.put(`/classes/${encodeURIComponent(oldName)}`, classData);
        return response.data;
    },
    deleteClass: async (className: string) => {
        const response = await axiosInstance.delete(`/classes/${encodeURIComponent(className)}`);
        return response.data;
    },
    getClassStudents: async (className: string) => {
        const response = await axiosInstance.get(`/classes/${encodeURIComponent(className)}/students`);
        return response.data;
    },
    getDashboardStats: async () => {
        const response = await axiosInstance.get('/dashboard-stats');
        return response.data;
    },
    createExam: async (examData: any) => {
        const response = await axiosInstance.post('/exams', examData);
        return response.data;
    },
    bulkUploadExams: async (exams: any[]) => {
        const response = await axiosInstance.post('/exams/bulk', { exams });
        return response.data;
    },
    getExamAttendanceList: async () => {
        const response = await axiosInstance.get('/attendance/exams');
        return response.data;
    },
    getExamReport: async (date: string, type: string) => {
        const response = await axiosInstance.get(`/attendance/exam-report?date=${date}&type=${type}`);
        return response.data;
    },
    getAiWeeklySummary: async () => {
        const response = await axiosInstance.get('/ai-summary');
        return response.data;
    },
    getErroredTopics: async () => {
        const response = await axiosInstance.get('/topics/errored');
        return response.data;
    },
    getCorrelationData: async () => {
        const response = await axiosInstance.get('/correlation/intelligence');
        return response.data;
    },
    getTrendingStudents: async () => {
        const response = await axiosInstance.get('/students/trending');
        return response.data;
    },
    getParents: async () => {
        const response = await axiosInstance.get('/parents');
        return response.data;
    },
    getCrmStats: async () => {
        const response = await axiosInstance.get('/crm/stats');
        return response.data;
    },
    batchGenerateReports: async (template?: string) => {
        const response = await axiosInstance.post('/reports/batch-generate', { template });
        return response.data;
    },
    getReportSample: async (refresh?: boolean) => {
        const response = await axiosInstance.get(`/crm/report-sample${refresh ? '?refresh=true' : ''}`);
        return response.data;
    },
    getBatchSuggestIntro: async () => {
        const response = await axiosInstance.get('/reports/batch-suggest-intro');
        return response.data;
    },
    batchMarkAsSent: async () => {
        const response = await axiosInstance.post('/reports/batch-mark-sent');
        return response.data;
    },
    markReportAsSent: async (id: number) => {
        const response = await axiosInstance.post(`/students/${id}/mark-sent`);
        return response.data;
    },
    getStudentCurriculum: async (id: number) => {
        const response = await axiosInstance.get(`/students/${id}/study-plan`);
        return response.data;
    },
    getInstitutionSettings: async () => {
        const response = await axiosInstance.get('/institution/settings');
        return response.data;
    },
    updateInstitutionSettings: async (data: any) => {
        const response = await axiosInstance.put('/institution/settings', data);
        return response.data;
    },
    getAttendance: async (date: string) => {
        const response = await axiosInstance.get(`/attendance?date=${date}`);
        return response.data;
    },
    updateAttendance: async (data: { studentId: number, date: string, status: string }) => {
        const response = await axiosInstance.post('/attendance', data);
        return response.data;
    },
    bulkAttendance: async (data: { date: string, studentIds: number[], status: string }) => {
        const response = await axiosInstance.post('/attendance/bulk', data);
        return response.data;
    },
    getStudentAttendance: async (studentId: number) => {
        const response = await axiosInstance.get(`/students/${studentId}/attendance`);
        return response.data;
    },
    sendSmartQuizPlan: async (studentId: number, plan: any) => {
        const response = await axiosInstance.post(`/students/${studentId}/smart-quiz/plan`, { plan });
        return response.data;
    },
    deleteSmartQuizAttempt: async (studentId: number, attemptId: string) => {
        const response = await axiosInstance.delete(`/students/${studentId}/smart-quiz/attempts/${attemptId}`);
        return response.data;
    },
    getSmartQuizAnalysis: async (studentId: number, attemptId?: string) => {
        const response = await axiosInstance.post(`/students/${studentId}/smart-quiz/analysis`, { attemptId });
        return response.data;
    },
    getAttendanceRisk: async () => {
        const response = await axiosInstance.get('/attendance/risk-analysis');
        return response.data;
    },
    getActiveStudentsDetails: async () => {
        const response = await axiosInstance.get('/active-students-details');
        return response.data;
    },
    getAssignedContents: async () => {
        const response = await axiosInstance.get('/assigned-contents');
        return response.data;
    },
    getAssignedContentFile: async (id: number) => {
        const response = await axiosInstance.get(`/assigned-contents/${id}/file`, {
            responseType: 'blob',
        });
        return response.data;
    },
    getAssignedContentAssignments: async () => {
        const response = await axiosInstance.get('/assigned-content-assignments');
        return response.data;
    },
    deleteAssignedContentAssignment: async (id: number) => {
        const response = await axiosInstance.delete(`/assigned-content-assignments/${id}`);
        return response.data;
    },
    createAssignedContent: async (payload: any) => {
        const response = await axiosInstance.post('/assigned-contents', payload);
        return response.data;
    },
    sendAssignedContentDirect: async (payload: any) => {
        const response = await axiosInstance.post('/assigned-contents/send', payload);
        return response.data;
    },
    updateAssignedContent: async (id: number, payload: any) => {
        const response = await axiosInstance.put(`/assigned-contents/${id}`, payload);
        return response.data;
    },
    deleteAssignedContent: async (id: number) => {
        const response = await axiosInstance.delete(`/assigned-contents/${id}`);
        return response.data;
    },
    assignContentToStudents: async (contentId: number, payload: any) => {
        const response = await axiosInstance.post(`/assigned-contents/${contentId}/assign`, payload);
        return response.data;
    },
    parseAnswerKey: async (payload: { imageBase64: string; mimeType?: string; sections?: { title: string; course?: string | null; blockLabel?: string | null; questionCount: number }[] }) => {
        const response = await axiosInstance.post('/assigned-contents/parse-answer-key', payload);
        return response.data;
    },
    // Appointments
    getAppointments: async (params?: { studentId?: number; teacherId?: number; status?: string; date?: string }) => {
        const response = await axiosInstance.get('/appointments', { params });
        return response.data;
    },
    createAppointment: async (payload: any) => {
        const response = await axiosInstance.post('/appointments', payload);
        return response.data;
    },
    updateAppointment: async (id: number, payload: any) => {
        const response = await axiosInstance.put(`/appointments/${id}`, payload);
        return response.data;
    },
    postponeAppointment: async (id: number, payload: { newStartTime: string, newEndTime?: string, note?: string }) => {
        const response = await axiosInstance.post(`/appointments/${id}/postpone`, payload);
        return response.data;
    },
    deleteAppointment: async (id: number) => {
        const response = await axiosInstance.delete(`/appointments/${id}`);
        return response.data;
    },
    // Guidance Surveys
    createGuidanceSurvey: async (payload: any) => {
        const response = await axiosInstance.post('/guidance/surveys', payload);
        return response.data;
    },
    getSurveyResults: async (id: number) => {
        const response = await axiosInstance.get(`/guidance/surveys/${id}/results`);
        return response.data;
    },
    getGuidanceSurveys: async () => {
        const response = await axiosInstance.get('/guidance/surveys');
        return response.data;
    },
    assignGuidanceSurvey: async (surveyId: number, payload: { studentId?: number; className?: string }) => {
        const response = await axiosInstance.post(`/guidance/surveys/${surveyId}/assign`, payload);
        return response.data;
    },
    getGuidanceSurveyResults: async (surveyId: number) => {
        const response = await axiosInstance.get(`/guidance/surveys/${surveyId}/results`);
        return response.data;
    },
    deleteGuidanceSurvey: async (id: number) => {
        const response = await axiosInstance.delete(`/guidance/surveys/${id}`);
        return response.data;
    },
    getStudentGuidanceData: async (studentId: number) => {
        const response = await axiosInstance.get(`/guidance/student/${studentId}`);
        return response.data;
    },
    getStudentCurriculumPlans: async (studentId: number) => {
        const response = await axiosInstance.get(`/guidance/curriculum/${studentId}`);
        return response.data;
    },
    updateStudentCurriculumPlan: async (payload: { studentId: number; weekStartDate: string; tasks: any[] }) => {
        const response = await axiosInstance.post('/guidance/curriculum', payload);
        return response.data;
    },
    getStudentCurriculumSuggestions: async (studentId: number) => {
        const response = await axiosInstance.post('/guidance/curriculum/suggest', { studentId });
        return response.data;
    },
    updateWeeklyTaskStatus: async (taskId: number, status: string) => {
        const response = await axiosInstance.post(`/guidance/curriculum/tasks/${taskId}/status`, { status });
        return response.data;
    },
    // Class Progress
    getClassProgress: async (params?: { instId?: number; classId?: number; courseId?: string }) => {
        const response = await axiosInstance.get('/class-progress', { params });
        return response.data;
    },
    createClassProgress: async (payload: { institutionId: number; classId: number; courseId: string; topicId: string; teacherId: number; note?: string; status?: 'ISLENIYOR' | 'TAMAMLANDI'; completedAt?: string }) => {
        const response = await axiosInstance.post('/class-progress', payload);
        return response.data;
    },
    updateClassProgress: async (id: number, payload: { classId: number; courseId: string; topicId: string; note?: string; status?: 'ISLENIYOR' | 'TAMAMLANDI'; completedAt?: string }) => {
        const response = await axiosInstance.put(`/class-progress/${id}`, payload);
        return response.data;
    },
    deleteClassProgress: async (id: number) => {
        const response = await axiosInstance.delete(`/class-progress/${id}`);
        return response.data;
    },
    getCurriculum: async (branch?: string) => {
        const response = await axiosInstance.get(`/curriculum${branch ? `?branch=${branch}` : ''}`);
        return response.data;
    },
    broadcastNotification: async (payload: { type: string, date: string, time: string, target: string, note?: string }) => {
        const response = await axiosInstance.post('/notifications/broadcast', payload);
        return response.data;
    },
    getNotificationHistory: async () => {
        const response = await axiosInstance.get('/notifications/history');
        return response.data;
    },
    updateNotification: async (id: number, payload: { type: string, date: string, time: string, target: string, note?: string }) => {
        const response = await axiosInstance.put(`/notifications/${id}`, payload);
        return response.data;
    },
    deleteNotification: async (id: number) => {
        const response = await axiosInstance.delete(`/notifications/${id}`);
        return response.data;
    },
    createParentActivation: async (payload: { studentId: number; parentPhone?: string; expiresInHours?: number }) => {
        const response = await axiosInstance.post('/parent-activations', payload);
        return response.data;
    },
    sendParentNotification: async (payload: { target: 'all' | 'class' | 'student'; title: string; body: string; priority: 'normal' | 'urgent'; type?: string; studentId?: number; className?: string }) => {
        const response = await axiosInstance.post('/parent-notifications', payload);
        return response.data;
    },
    sendParentReportNotification: async (payload: { mode?: 'single' | 'ready'; studentId?: number }) => {
        const response = await axiosInstance.post('/parent-notifications/report', payload);
        return response.data;
    },
    getParentNotificationHistory: async () => {
        const response = await axiosInstance.get('/parent-notifications/history');
        return response.data;
    },
    deleteParentNotification: async (id: number) => {
        const response = await axiosInstance.delete(`/parent-notifications/${id}`);
        return response.data;
    },
    revokeParentSession: async (id: number) => {
        const response = await axiosInstance.post(`/parent-sessions/${id}/revoke`, {});
        return response.data;
    },
    // Accounting
    getAccountingTransactions: async (filters?: { startDate?: string, endDate?: string, type?: string }) => {
        const params = new URLSearchParams();
        if (filters?.startDate) params.append('startDate', filters.startDate);
        if (filters?.endDate) params.append('endDate', filters.endDate);
        if (filters?.type) params.append('type', filters.type);
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await axiosInstance.get(`/accounting/transactions${query}`);
        return response.data;
    },
    getStudentInstallments: async () => {
        const response = await axiosInstance.get('/accounting/installments');
        return response.data;
    },
    getAccountingCategories: async () => {
        const response = await axiosInstance.get('/accounting/categories');
        return response.data;
    },
    createAccountingCategory: async (data: { name: string, type: string }) => {
        const response = await axiosInstance.post('/accounting/categories', data);
        return response.data;
    },
    deleteAccountingCategory: async (id: number) => {
        const response = await axiosInstance.delete(`/accounting/categories/${id}`);
        return response.data;
    },
    getCategoryBreakdown: async () => {
        const response = await axiosInstance.get('/accounting/category-breakdown');
        return response.data;
    },
    getMonthlyReport: async () => {
        const response = await axiosInstance.get('/accounting/monthly-report');
        return response.data;
    },
    createAccountingTransaction: async (data: any) => {
        const response = await axiosInstance.post('/accounting/transactions', data);
        return response.data;
    },
    createBulkInstallments: async (data: { studentId: number, count: number, totalAmount: number, startDate: string, description?: string }) => {
        const response = await axiosInstance.post('/accounting/installments/bulk', data);
        return response.data;
    },
    deleteBulkInstallments: async (studentId: number) => {
        const response = await axiosInstance.delete(`/accounting/installments/bulk/${studentId}`);
        return response.data;
    },
    deleteAccountingTransaction: async (id: number) => {
        const response = await axiosInstance.delete(`/accounting/transactions/${id}`);
        return response.data;
    }
};
