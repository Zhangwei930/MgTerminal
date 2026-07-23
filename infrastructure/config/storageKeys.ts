export const STORAGE_KEY_HOSTS = 'magiesTerminal_hosts_v1';
export const STORAGE_KEY_KEYS = 'magiesTerminal_keys_v1';
export const STORAGE_KEY_GROUPS = 'magiesTerminal_groups_v1';
export const STORAGE_KEY_CUSTOM_GROUPS = STORAGE_KEY_GROUPS;
export const STORAGE_KEY_SNIPPETS = 'magiesTerminal_snippets_v1';
export const STORAGE_KEY_SNIPPET_PACKAGES = 'magiesTerminal_snippet_packages_v1';
export const STORAGE_KEY_NOTES = 'magiesTerminal_notes_v1';
export const STORAGE_KEY_NOTE_GROUPS = 'magiesTerminal_note_groups_v1';
/** Last-filled values per snippet id for {{variable}} placeholders. */
export const STORAGE_KEY_SNIPPET_VAR_VALUES = 'magiesTerminal_snippet_var_values_v1';
export const STORAGE_KEY_THEME = 'magiesTerminal_theme_v1';
export const STORAGE_KEY_COLOR = 'magiesTerminal_color_v1';
export const STORAGE_KEY_ACCENT_MODE = 'magiesTerminal_accent_mode_v1';
export const STORAGE_KEY_UI_THEME_LIGHT = 'magiesTerminal_ui_theme_light_v1';
export const STORAGE_KEY_UI_THEME_DARK = 'magiesTerminal_ui_theme_dark_v1';
export const STORAGE_KEY_UI_FONT_FAMILY = 'magiesTerminal_ui_font_family_v1';
export const STORAGE_KEY_SYNC = 'magiesTerminal_sync_v1';
export const STORAGE_KEY_TERM_THEME = 'magiesTerminal_term_theme_v1';
export const STORAGE_KEY_TERM_FOLLOW_APP_THEME = 'magiesTerminal_term_follow_app_theme_v1';
export const STORAGE_KEY_TERM_THEME_DARK = 'magiesTerminal_term_theme_dark_v1';
export const STORAGE_KEY_TERM_THEME_LIGHT = 'magiesTerminal_term_theme_light_v1';
export const STORAGE_KEY_TERM_FONT_FAMILY = 'magiesTerminal_term_font_family_v1';
export const STORAGE_KEY_TERM_FONT_SIZE = 'magiesTerminal_term_font_size_v1';
export const STORAGE_KEY_TERM_SETTINGS = 'magiesTerminal_term_settings_v1';
export const STORAGE_KEY_HOTKEY_SCHEME = 'magiesTerminal_hotkey_scheme_v1';
export const STORAGE_KEY_CUSTOM_KEY_BINDINGS = 'magiesTerminal_custom_key_bindings_v1';
export const STORAGE_KEY_HOTKEY_RECORDING = 'magiesTerminal_hotkey_recording_v1';
export const STORAGE_KEY_CUSTOM_CSS = 'magiesTerminal_custom_css_v1';
export const STORAGE_KEY_UI_LANGUAGE = 'magiesTerminal_ui_language_v1';
export const STORAGE_KEY_PORT_FORWARDING = 'magiesTerminal_port_forwarding_v1';
export const STORAGE_KEY_DB_CONNECTIONS = 'magiesTerminal_db_connections_v1';
export const STORAGE_KEY_PF_PREFER_FORM_MODE = 'magiesTerminal_pf_prefer_form_mode_v1';
export const STORAGE_KEY_PF_VIEW_MODE = 'magiesTerminal_pf_view_mode_v1';
export const STORAGE_KEY_KNOWN_HOSTS = 'magiesTerminal_known_hosts_v1';
export const STORAGE_KEY_SHELL_HISTORY = 'magiesTerminal_shell_history_v1';
export const STORAGE_KEY_CONNECTION_LOGS = 'magiesTerminal_connection_logs_v1';
/** Side store for unsaved connection-log terminal replay buffers (main blob omits them for perf). */
export const STORAGE_KEY_CONNECTION_LOG_TERMINAL_DATA = 'magiesTerminal_connection_log_terminal_data_v1';
/** Bookmarks / notes for connection log replay positions, keyed by log id. */
export const STORAGE_KEY_LOG_BOOKMARKS = 'magiesTerminal_log_bookmarks_v1';
/** User-named reusable workspace layouts (hosts + splits + optional cwd/startup). */
export const STORAGE_KEY_WORKSPACE_TEMPLATES = 'magiesTerminal_workspace_templates_v1';
export const STORAGE_KEY_SESSION_RESTORE = 'magiesTerminal_session_restore_v1';
export const STORAGE_KEY_RESTORE_PREVIOUS_SESSION = 'magiesTerminal_restore_previous_session_v1';
export const STORAGE_KEY_RESTORE_TERMINAL_CWD = 'magiesTerminal_restore_terminal_cwd_v1';
export const STORAGE_KEY_IDENTITIES = 'magiesTerminal_identities_v1';
export const STORAGE_KEY_PROXY_PROFILES = 'magiesTerminal_proxy_profiles_v1';
export const STORAGE_KEY_VAULT_HOSTS_VIEW_MODE = 'magiesTerminal_vault_hosts_view_mode_v1';
export const STORAGE_KEY_VAULT_HOSTS_SORT_MODE = 'magiesTerminal_vault_hosts_sort_mode_v1';
export const STORAGE_KEY_VAULT_HOSTS_TREE_EXPANDED = 'magiesTerminal_vault_hosts_tree_expanded_v1';
export const STORAGE_KEY_VAULT_SIDEBAR_COLLAPSED = 'magiesTerminal_vault_sidebar_collapsed_v1';
export const STORAGE_KEY_VAULT_SIDEBAR_WIDTH = 'magiesTerminal_vault_sidebar_width_v1';
export const STORAGE_KEY_VAULT_KEYS_VIEW_MODE = 'magiesTerminal_vault_keys_view_mode_v1';
export const STORAGE_KEY_VAULT_PROXY_PROFILES_VIEW_MODE = 'magiesTerminal_vault_proxy_profiles_view_mode_v1';
export const STORAGE_KEY_VAULT_SNIPPETS_VIEW_MODE = 'magiesTerminal_vault_snippets_view_mode_v1';
export const STORAGE_KEY_VAULT_NOTES_VIEW_MODE = 'magiesTerminal_vault_notes_view_mode_v1';
export const STORAGE_KEY_VAULT_NOTES_EDITOR_MODE = 'magiesTerminal_vault_notes_editor_mode_v1';
export const STORAGE_KEY_VAULT_NOTES_SELECTED_GROUP = 'magiesTerminal_vault_notes_selected_group_v1';
export const STORAGE_KEY_VAULT_NOTES_TREE_WIDTH = 'magiesTerminal_vault_notes_tree_width_v1';
/** Inline snippet/script edit panel width (px). */
export const STORAGE_KEY_SNIPPETS_PANEL_WIDTH = 'magiesTerminal_snippets_panel_width_v1';
/** Inline vault host/group details panel width (px). */
export const STORAGE_KEY_VAULT_HOST_PANEL_WIDTH = 'magiesTerminal_vault_host_panel_width_v1';
/** Inline snippet script editor height (px) in vault edit panel. */
export const STORAGE_KEY_SNIPPET_SCRIPT_EDITOR_HEIGHT = 'magiesTerminal_snippet_script_editor_height_v1';
/** Automation script Monaco editor height (px) in vault sidebar. */
export const STORAGE_KEY_SCRIPT_EDITOR_HEIGHT = 'magiesTerminal_script_editor_height_v1';
/** Terminal compose bar total height (px). */
export const STORAGE_KEY_COMPOSE_BAR_HEIGHT = 'magiesTerminal_compose_bar_height_v1';
/** Snippet IDs pinned to the terminal compose bar quick strip. */
export const STORAGE_KEY_COMPOSE_BAR_PINNED_SNIPPETS = 'magiesTerminal_compose_bar_pinned_snippets_v1';
export const STORAGE_KEY_VAULT_KNOWN_HOSTS_VIEW_MODE = 'magiesTerminal_vault_known_hosts_view_mode_v1';
/** Local-first team vault policy (roles + audit key; no secrets). */
export const STORAGE_KEY_TEAM_VAULT_POLICY = 'magiesTerminal_team_vault_policy_v1';
/** Local team vault audit ring (optionally HMAC-signed). */
export const STORAGE_KEY_TEAM_VAULT_AUDIT = 'magiesTerminal_team_vault_audit_v1';
/** Default WAN follow relay host:port for outbound invites. */
export const STORAGE_KEY_FOLLOW_WAN_RELAY = 'magiesTerminal_follow_wan_relay_v1';
/** Display name used in team vault / follow collaboration UI. */
export const STORAGE_KEY_DISPLAY_NAME = 'magiesTerminal_display_name_v1';

// Update check
export const STORAGE_KEY_UPDATE_LAST_CHECK = 'magiesTerminal_update_last_check_v1';
export const STORAGE_KEY_UPDATE_DISMISSED_VERSION = 'magiesTerminal_update_dismissed_version_v1';
export const STORAGE_KEY_UPDATE_LATEST_RELEASE = 'magiesTerminal_update_latest_release_v1';
export const STORAGE_KEY_AUTO_UPDATE_ENABLED = 'magiesTerminal_auto_update_enabled_v1';
export const STORAGE_KEY_LOCAL_VAULT_BACKUP_MAX_COUNT = 'magiesTerminal_local_vault_backup_max_count_v1';
export const STORAGE_KEY_LOCAL_VAULT_BACKUP_LAST_APP_VERSION = 'magiesTerminal_local_vault_backup_last_app_version_v1';

/**
 * Cross-window barrier: set while a local vault restore is applying so
 * auto-sync in another window doesn't upload a pre-restore snapshot
 * concurrently. The value is an epoch-ms deadline — auto-sync treats any
 * value in the future as "restore in progress" and any value in the past
 * as a stale lock that can be ignored. See useAutoSync and
 * CloudSyncSettings for readers/writers.
 */
export const STORAGE_KEY_VAULT_RESTORE_IN_PROGRESS_UNTIL = 'magiesTerminal_vault_restore_in_progress_until_v1';

/**
 * Apply-in-progress sentinel. Set before a destructive applySyncPayload
 * starts writing and cleared after it completes successfully. If this
 * value is present on a later startup, the previous apply was
 * interrupted mid-way (renderer crash, power loss, IPC failure) and the
 * local vault is a partial mix of pre-apply and post-apply state.
 * Auto-sync must refuse to push in that window — otherwise the partial
 * state would silently overwrite an intact cloud copy — until the user
 * manually restores from a protective backup or completes a full merge.
 * The value is a JSON-encoded record (startedAt, protectiveBackupId,
 * source) so the UI can surface a specific recovery hint rather than a
 * generic "something broke" warning.
 */
export const STORAGE_KEY_VAULT_APPLY_IN_PROGRESS = 'magiesTerminal_vault_apply_in_progress_v1';

// SFTP File Opener Associations
export const STORAGE_KEY_SFTP_FILE_ASSOCIATIONS = 'magiesTerminal_sftp_file_associations_v1';
export const STORAGE_KEY_SFTP_DEFAULT_OPENER = 'magiesTerminal_sftp_default_opener_v1';

// SFTP Local Bookmarks
export const STORAGE_KEY_SFTP_LOCAL_BOOKMARKS = 'magiesTerminal_sftp_local_bookmarks_v1';

// SFTP Global Bookmarks (shared across all hosts)
export const STORAGE_KEY_SFTP_GLOBAL_BOOKMARKS = 'magiesTerminal_sftp_global_bookmarks_v1';

// SFTP Settings
export const STORAGE_KEY_SFTP_DOUBLE_CLICK_BEHAVIOR = 'magiesTerminal_sftp_double_click_behavior_v1';
export const STORAGE_KEY_SFTP_AUTO_SYNC = 'magiesTerminal_sftp_auto_sync_v1';
export const STORAGE_KEY_SFTP_SHOW_HIDDEN_FILES = 'magiesTerminal_sftp_show_hidden_files_v1';
export const STORAGE_KEY_SFTP_USE_COMPRESSED_UPLOAD = 'magiesTerminal_sftp_use_compressed_upload_v1';
export const STORAGE_KEY_SFTP_AUTO_OPEN_SIDEBAR = 'magiesTerminal_sftp_auto_open_sidebar_v1';
export const STORAGE_KEY_SFTP_FOLLOW_TERMINAL_CWD = 'magiesTerminal_sftp_follow_terminal_cwd_v1';
export const STORAGE_KEY_SFTP_DEFAULT_VIEW_MODE = 'magiesTerminal_sftp_default_view_mode_v1';
export const STORAGE_KEY_SFTP_HOST_VIEW_MODES = 'magiesTerminal_sftp_host_view_modes_v1';
export const STORAGE_KEY_SFTP_TRANSFER_PANEL_HEIGHT = 'magiesTerminal_sftp_transfer_panel_height_v1';
export const STORAGE_KEY_SFTP_TRANSFER_CHILD_NAME_WIDTH = 'magiesTerminal_sftp_transfer_child_name_width_v1';
/** Incomplete SFTP file transfer queue (resume/retry after restart). */
export const STORAGE_KEY_SFTP_TRANSFER_QUEUE = 'magiesTerminal_sftp_transfer_queue_v1';

/** First-launch onboarding wizard completed. */
export const STORAGE_KEY_ONBOARDING_COMPLETE = 'magiesTerminal_onboarding_complete_v1';
/** First successful connection tip already shown. */
export const STORAGE_KEY_FIRST_CONNECTION_TIPS_SHOWN = 'magiesTerminal_first_connection_tips_shown_v1';

// Editor Settings
export const STORAGE_KEY_EDITOR_WORD_WRAP = 'magiesTerminal_editor_word_wrap_v1';

// Session Logs Settings
export const STORAGE_KEY_SESSION_LOGS_ENABLED = 'magiesTerminal_session_logs_enabled_v1';
export const STORAGE_KEY_SESSION_LOGS_DIR = 'magiesTerminal_session_logs_dir_v1';
export const STORAGE_KEY_SESSION_LOGS_FORMAT = 'magiesTerminal_session_logs_format_v1';
export const STORAGE_KEY_SESSION_LOGS_TIMESTAMPS_ENABLED = 'magiesTerminal_session_logs_timestamps_enabled_v1';
export const STORAGE_KEY_SSH_DEBUG_LOGS_ENABLED = 'magiesTerminal_ssh_debug_logs_enabled_v1';
export const STORAGE_KEY_SSH_DEEP_LINK_ENABLED = 'magiesTerminal_ssh_deep_link_enabled_v1';
export const STORAGE_KEY_JMS_DEEP_LINK_ENABLED = 'magiesTerminal_jms_deep_link_enabled_v1';

// Archived legacy key records that are no longer supported by the app (e.g. biometric/WebAuthn/FIDO2 experiments).
export const STORAGE_KEY_LEGACY_KEYS = 'magiesTerminal_legacy_keys_v1';

// Managed Sources - external files that manage groups of hosts (e.g., ~/.ssh/config)
export const STORAGE_KEY_MANAGED_SOURCES = 'magiesTerminal_managed_sources_v1';

/** Opt-in platform unlock before vault secrets are decrypted into memory. */
export const STORAGE_KEY_VAULT_PLATFORM_UNLOCK = 'magiesTerminal_vault_platform_unlock_v1';

// Global Toggle Window Settings (Quake Mode)
export const STORAGE_KEY_TOGGLE_WINDOW_HOTKEY = 'magiesTerminal_toggle_window_hotkey_v1';
export const STORAGE_KEY_CLOSE_TO_TRAY = 'magiesTerminal_close_to_tray_v1';
/** App-level HTTP(S) proxy for cloud sync / AI (not SSH ProxyJump). */
export const STORAGE_KEY_HTTP_NETWORK_PROXY = 'magiesTerminal_http_network_proxy_v1';
export const STORAGE_KEY_GLOBAL_HOTKEY_ENABLED = 'magiesTerminal_global_hotkey_enabled_v1';
export const STORAGE_KEY_WINDOW_OPACITY = 'magiesTerminal_window_opacity_v1';
export const STORAGE_KEY_APP_ICON_VARIANT = 'magiesTerminal_app_icon_variant_v1';
// Custom Terminal Themes
export const STORAGE_KEY_CUSTOM_THEMES = 'magiesTerminal_custom_themes_v1';

// AI Settings
export const STORAGE_KEY_AI_PROVIDERS = 'magiesTerminal_ai_providers_v1';
export const STORAGE_KEY_AI_ACTIVE_PROVIDER = 'magiesTerminal_ai_active_provider_v1';
export const STORAGE_KEY_AI_ACTIVE_MODEL = 'magiesTerminal_ai_active_model_v1';
export const STORAGE_KEY_AI_PERMISSION_MODE = 'magiesTerminal_ai_permission_mode_v1';
export const STORAGE_KEY_AI_TOOL_INTEGRATION_MODE = 'magiesTerminal_ai_tool_integration_mode_v1';
export const STORAGE_KEY_AI_HOST_PERMISSIONS = 'magiesTerminal_ai_host_permissions_v1';
export const STORAGE_KEY_AI_EXTERNAL_AGENTS = 'magiesTerminal_ai_external_agents_v1';
export const STORAGE_KEY_AI_DEFAULT_AGENT = 'magiesTerminal_ai_default_agent_v1';
export const STORAGE_KEY_AI_COMMAND_BLOCKLIST = 'magiesTerminal_ai_command_blocklist_v1';
export const STORAGE_KEY_AI_COMMAND_TIMEOUT = 'magiesTerminal_ai_command_timeout_v1';
export const STORAGE_KEY_AI_MAX_ITERATIONS = 'magiesTerminal_ai_max_iterations_v1';
export const STORAGE_KEY_AI_SESSIONS = 'magiesTerminal_ai_sessions_v1';
export const STORAGE_KEY_AI_ACTIVE_SESSION_MAP = 'magiesTerminal_ai_active_session_map_v1';
export const STORAGE_KEY_AI_AGENT_MODEL_MAP = 'magiesTerminal_ai_agent_model_map_v1';
export const STORAGE_KEY_AI_AGENT_PROVIDER_MAP = 'magiesTerminal_ai_agent_provider_map_v1';
export const STORAGE_KEY_AI_WEB_SEARCH = 'magiesTerminal_ai_web_search_v1';
export const STORAGE_KEY_AI_QUICK_MESSAGES = 'magiesTerminal_ai_quick_messages_v1';
/** Confirm-mode permission grant memory (capability + session/command patterns). */
export const STORAGE_KEY_AI_PERMISSION_GRANTS = 'magiesTerminal_ai_permission_grants_v1';
/** Ring buffer of recent tool-approval request/resolve events (no args/secrets). */
export const STORAGE_KEY_AI_APPROVAL_AUDIT = 'magiesTerminal_ai_approval_audit_v1';
export const STORAGE_KEY_AI_SHOW_TERMINAL_SELECTION_ACTION = 'magiesTerminal_ai_show_terminal_selection_action_v1';
export const STORAGE_KEY_AI_STRICT_LOCAL_PRIVACY = 'magiesTerminal_ai_strict_local_privacy_v1';
/** External MCP: whether the user last enabled the public catalog MCP endpoint. */
export const STORAGE_KEY_AI_EXTERNAL_MCP_ENABLED = 'magiesTerminal_ai_external_mcp_enabled_v1';
/** External MCP lifecycle mode: temporary (idle timeout) or persistent (restore on launch). */
export const STORAGE_KEY_AI_EXTERNAL_MCP_MODE = 'magiesTerminal_ai_external_mcp_mode_v1';
/** External MCP idle timeout in minutes (temporary mode only). */
export const STORAGE_KEY_AI_EXTERNAL_MCP_IDLE_TIMEOUT_MINUTES = 'magiesTerminal_ai_external_mcp_idle_timeout_minutes_v1';
/** Desktop pet: whether the floating AI-status pet overlay is enabled. */
export const STORAGE_KEY_AI_PET_ENABLED = 'magiesTerminal_ai_pet_enabled_v1';
/** Desktop pet: custom image config (dataUrl + sprite grid), or absent for the default pet. */
export const STORAGE_KEY_AI_PET_IMAGE = 'magiesTerminal_ai_pet_image_v1';
/** Desktop pet: latest broadcast AI status, written by the main window and read by the pet window. */
export const STORAGE_KEY_AI_PET_STATE = 'magiesTerminal_ai_pet_state_v1';
/** Desktop pet: one fixed command line run via the pet's right-click menu (argv, no shell). */
export const STORAGE_KEY_AI_PET_CUSTOM_COMMAND = 'magiesTerminal_ai_pet_custom_command_v1';
/** Desktop pet: sprite/content scale factor (0.5-2). */
export const STORAGE_KEY_AI_PET_SCALE = 'magiesTerminal_ai_pet_scale_v1';
/** Desktop pet: window opacity (0.3-1), applied to the whole overlay window. */
export const STORAGE_KEY_AI_PET_OPACITY = 'magiesTerminal_ai_pet_opacity_v1';
/** Desktop pet: whether the overlay stays pinned above other windows. */
export const STORAGE_KEY_AI_PET_ALWAYS_ON_TOP = 'magiesTerminal_ai_pet_always_on_top_v1';
/** Desktop pet: whether the status speech bubble is shown at all. */
export const STORAGE_KEY_AI_PET_SHOW_BUBBLE = 'magiesTerminal_ai_pet_show_bubble_v1';
/** Desktop pet: suppress the active tool/task name in the bubble, show only a generic status. */
export const STORAGE_KEY_AI_PET_PRIVACY_MODE = 'magiesTerminal_ai_pet_privacy_mode_v1';
/** Desktop pet: whether a completed/failed long-running task shows an OS notification. */
export const STORAGE_KEY_AI_PET_NOTIFICATIONS_ENABLED = 'magiesTerminal_ai_pet_notifications_enabled_v1';

// SFTP Transfer Concurrency
export const STORAGE_KEY_SFTP_TRANSFER_CONCURRENCY = 'magiesTerminal_sftp_transfer_concurrency_v1';

// Workspace Focus Indicator Style
export const STORAGE_KEY_WORKSPACE_FOCUS_STYLE = 'magiesTerminal_workspace_focus_style_v1';

// Vault: Show Recently Connected hosts section
export const STORAGE_KEY_SHOW_RECENT_HOSTS = 'magiesTerminal_show_recent_hosts_v1';
export const STORAGE_KEY_SHOW_ONLY_UNGROUPED_HOSTS_IN_ROOT = 'magiesTerminal_show_only_ungrouped_hosts_in_root_v1';

// Top tabs: Show standalone SFTP view tab
export const STORAGE_KEY_SHOW_SFTP_TAB = 'magiesTerminal_show_sftp_tab_v1';
export const STORAGE_KEY_SHOW_HOST_TREE_SIDEBAR = 'magiesTerminal_show_host_tree_sidebar_v1';

// Shortcuts: Cmd/Ctrl+[1...9] and Ctrl+Tab skip pinned Vault/SFTP tabs
export const STORAGE_KEY_SHELL_ONLY_TAB_NUMBER_SHORTCUTS = 'magiesTerminal_shell_only_tab_number_shortcuts_v1';

// Shortcuts: disable terminal font zoom shortcuts
export const STORAGE_KEY_DISABLE_TERMINAL_FONT_ZOOM = 'magiesTerminal_disable_terminal_font_zoom_v1';

// Group Configurations (default settings inherited by hosts)
export const STORAGE_KEY_GROUP_CONFIGS = 'magiesTerminal_group_configs_v1';

// Side Panel
export const STORAGE_KEY_SIDE_PANEL_WIDTH = 'magiesTerminal_side_panel_width';
export const STORAGE_KEY_TERMINAL_SIDE_PANEL_TAB_ORDER = 'magiesTerminal_terminal_side_panel_tab_order_v1';
export const STORAGE_KEY_TERMINAL_SIDE_PANEL_AUTO_OPEN = 'magiesTerminal_terminal_side_panel_auto_open_v1';
export const STORAGE_KEY_TERMINAL_SIDE_PANEL_AUTO_OPEN_TAB = 'magiesTerminal_terminal_side_panel_auto_open_tab_v1';
export const STORAGE_KEY_WORKSPACE_FOCUS_SIDEBAR_WIDTH = 'magiesTerminal_workspace_focus_sidebar_width';
export const STORAGE_KEY_TERMINAL_HOST_TREE_WIDTH = 'magiesTerminal_terminal_host_tree_width_v1';
export const STORAGE_KEY_TERMINAL_HOST_TREE_COLLAPSED = 'magiesTerminal_terminal_host_tree_collapsed_v1';
export const STORAGE_KEY_TERMINAL_COMPOSE_BAR_OPEN = 'magiesTerminal_terminal_compose_bar_open_v1';
export const STORAGE_KEY_TERMINAL_SEARCH_OPEN = 'magiesTerminal_terminal_search_open_v1';
export const STORAGE_KEY_TERMINAL_ENCODING_BY_HOST_PREFIX = 'magiesTerminal_terminal_encoding_by_host_v1:';
export const STORAGE_KEY_TERMINAL_YMODEM_SEND_DIR = 'magiesTerminal_terminal_ymodem_send_dir_v1';

// Port Forwarding (transient cross-window broadcast key)
export const STORAGE_KEY_PF_RECONNECT_CANCEL = '__magiesTerminal_pf_cancel_reconnect';

// Default SSH Key Passphrases (for ~/.ssh keys not managed in the vault)
export const STORAGE_KEY_DEFAULT_KEY_PASSPHRASES = 'magiesTerminal_default_key_passphrases_v1';

// Debug Flags (no _v1 suffix — developer-only, not persisted data)
export const STORAGE_KEY_DEBUG_HOTKEYS = 'debug.hotkeys';
export const STORAGE_KEY_DEBUG_UPDATE_DEMO = 'debug.updateDemo';
