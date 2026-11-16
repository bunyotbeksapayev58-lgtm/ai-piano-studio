export interface ProjectStatusResponse {
  id: string;
  filename: string;
  file_size: number;
  duration_seconds: number;
  title?: string;
  status:
    | "UPLOADED"
    | "INSPECTING_MEDIA"
    | "EXTRACTING_AUDIO"
    | "PREPARING_AUDIO"
    | "ANALYZING_MUSIC"
    | "DETECTING_NOTES"
    | "GENERATING_MIDI"
    | "SYNTHESIZING_AUDIO"
    | "RENDERING_ANIMATION"
    | "EXPORTING_MP4"
    | "COMPLETE"
    | "FAILED";
  progress_percent: number;
  current_step: number;
  status_message: string;
  error_message?: string | null;
  note_count: number;
  tempo: number;
  quality_metrics: Record<string, any>;
  visual_settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
  has_audio: boolean;
  has_midi: boolean;
  has_synth_audio: boolean;
  has_rendered_video: boolean;
}

export interface NoteDto {
  pitch: number;
  start_time: number;
  end_time: number;
  duration: number;
  velocity: number;
  hand: "right" | "left";
  channel: number;
}

export interface PreviewDataResponse {
  project_id: string;
  duration_seconds: number;
  tempo: number;
  note_count: number;
  notes: NoteDto[];
  audio_url: string | null;
  visual_settings?: Record<string, any>;
}

export interface DashboardStatsResponse {
  total_projects: number;
  completed_projects: number;
  processing_projects: number;
  failed_projects: number;
  total_storage_mb?: number;
  storage_limit_mb?: number;
  storage_mb?: number;
}

export interface SoundPresetOption {
  id: string;
  name: string;
  description: string;
}

export interface ThemeOption {
  id: string;
  name: string;
}

export interface SongModeOption {
  id: string;
  name: string;
  description: string;
}

export interface HandsStyleOption {
  id: string;
  name: string;
}

export interface PresetsResponse {
  sound_presets: SoundPresetOption[];
  themes: ThemeOption[];
  song_modes: SongModeOption[];
  hands_styles: HandsStyleOption[];
}

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

const API_BASE: string = "/api";
const TOKEN_KEY = "ai_piano_token";
const USER_KEY = "ai_piano_user";

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
}

export const authApi = {
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },

  getCurrentUser(): UserResponse | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async register(username: string, email: string, password: string): Promise<TokenResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Registration failed");
    }
    const data: TokenResponse = await res.json();
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return data;
  },

  async login(loginStr: string, password: string): Promise<TokenResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginStr, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    const data: TokenResponse = await res.json();
    if (typeof window !== "undefined") {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return data;
  },

  async getMe(): Promise<UserResponse | null> {
    const token = this.getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        this.logout();
        return null;
      }
      const user = await res.json();
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  },

  logout(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  },
};

export const api = {
  async getPresets(): Promise<PresetsResponse> {
    const res = await fetch(`${API_BASE}/projects/presets`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        sound_presets: [],
        themes: [],
        song_modes: [],
        hands_styles: [],
      };
    }
    return res.json();
  },

  async getStats(): Promise<DashboardStatsResponse> {
    const res = await fetch(`${API_BASE}/projects/stats`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        total_projects: 0,
        completed_projects: 0,
        processing_projects: 0,
        failed_projects: 0,
        storage_mb: 0,
      };
    }
    return res.json();
  },

  async uploadVideo(
    file: File,
    options?: {
      song_mode?: string;
      sound_preset?: string;
      theme?: string;
      hands_style?: string;
    },
    onProgress?: (percent: number) => void
  ): Promise<ProjectStatusResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.song_mode) formData.append("song_mode", options.song_mode);
    if (options?.sound_preset) formData.append("sound_preset", options.sound_preset);
    if (options?.theme) formData.append("theme", options.theme);
    if (options?.hands_style) formData.append("hands_style", options.hands_style);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/projects/upload`);

      const token = authApi.getToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (err) {
            reject(new Error("Invalid JSON response from server"));
          }
        } else {
          let errDetail = "Upload failed";
          try {
            const errJson = JSON.parse(xhr.responseText);
            errDetail = errJson.detail || errDetail;
          } catch (_) {}
          reject(new Error(errDetail));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });
  },

  async startAnalysis(
    projectId: string,
    autoRender: boolean = true,
    options?: {
      song_mode?: string;
      sound_preset?: string;
      theme?: string;
      hands_style?: string;
    }
  ): Promise<ProjectStatusResponse> {
    const query = new URLSearchParams({ auto_render: String(autoRender) });
    if (options?.song_mode) query.append("song_mode", options.song_mode);
    if (options?.sound_preset) query.append("sound_preset", options.sound_preset);
    if (options?.theme) query.append("theme", options.theme);
    if (options?.hands_style) query.append("hands_style", options.hands_style);

    const res = await fetch(`${API_BASE}/projects/${projectId}/analyze?${query.toString()}`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to start analysis");
    }
    return res.json();
  },

  async getStatus(projectId: string): Promise<ProjectStatusResponse> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/status`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Failed to fetch project status");
    }
    return res.json();
  },

  async getPreview(projectId: string): Promise<PreviewDataResponse> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/preview`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to fetch preview data");
    }
    return res.json();
  },

  async updateMidi(
    projectId: string,
    notes: NoteDto[],
    tempo?: number,
    autoResynthesize: boolean = true,
    autoRerender: boolean = false
  ): Promise<ProjectStatusResponse> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/midi`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        notes,
        tempo,
        auto_resynthesize: autoResynthesize,
        auto_rerender: autoRerender,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update MIDI");
    }
    return res.json();
  },

  async patchProject(
    projectId: string,
    data: { title?: string; visual_settings?: Record<string, any> }
  ): Promise<ProjectStatusResponse> {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update project settings");
    }
    return res.json();
  },

  async triggerRender(projectId: string): Promise<ProjectStatusResponse> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/render`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error("Failed to trigger video render");
    }
    return res.json();
  },

  async getProjects(): Promise<ProjectStatusResponse[]> {
    const res = await fetch(`${API_BASE}/projects`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      return [];
    }
    return res.json();
  },

  async deleteProject(projectId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error("Failed to delete project");
    }
  },

  getVideoStreamUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/video`;
  },

  getVideoUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/video`;
  },

  getAudioStreamUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/audio`;
  },

  getAudioUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/audio`;
  },

  getDownloadUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/download`;
  },

  getVideoDownloadUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/download`;
  },

  getMidiDownloadUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/midi`;
  },
};
