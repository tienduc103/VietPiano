import { useSmartSuggestions } from '../../hooks/useSmartShortcuts';
import { useSmartShortcuts } from '../../store/smartShortcutStore';
import { ShortcutBar } from './ShortcutBar';

/**
 * Thanh lối tắt trang chủ + Lối tắt thông minh: lối tắt thủ công giữ nguyên thứ tự người dùng đặt, đề xuất ưu tiên cao
 * nhất chỉ lên thanh khi còn chỗ (tối đa 1, tắt được), phần còn lại ở nhóm "✨ Gợi ý" của menu ⋯ (Mở / 📌 Ghim / Ẩn).
 * Tắt Lối tắt thông minh → `suggestions` rỗng → thanh y như khi chưa có tính năng này.
 */
export function SmartShortcutBar({ className }: { className?: string }) {
  const suggestions = useSmartSuggestions();
  const enabled = useSmartShortcuts((s) => s.state.settings.enabled);
  const showOnBar = useSmartShortcuts((s) => s.state.settings.showOnBar);
  const dismiss = useSmartShortcuts((s) => s.dismiss);
  const markOpened = useSmartShortcuts((s) => s.markOpened);
  return (
    <ShortcutBar
      className={className}
      suggestions={suggestions}
      // Bật → nút ⋯ có ngay từ khung đầu (không đổi "+ Lối tắt" → ⋯ khi đề xuất nạp xong, tránh bấm nhầm).
      suggestionsEnabled={enabled}
      maxSuggestionsOnBar={showOnBar ? 1 : 0}
      onDismissSuggestion={dismiss}
      onOpenSuggestion={markOpened}
    />
  );
}
