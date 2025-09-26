"""
现代化冒泡排序实现
使用Python 3.12+的最新特性：泛型语法、类型提示、dataclass等
"""

from dataclasses import dataclass
from typing import Protocol, Any
from collections.abc import Sequence, MutableSequence
import time


class Comparable(Protocol):
    """可比较对象协议"""
    def __lt__(self, other: Any) -> bool: ...
    def __le__(self, other: Any) -> bool: ...
    def __gt__(self, other: Any) -> bool: ...
    def __ge__(self, other: Any) -> bool: ...


@dataclass
class SortResult[T: Comparable]:
    """排序结果数据类"""
    sorted_data: list[T]
    comparisons: int
    swaps: int
    time_elapsed: float

    def __str__(self) -> str:
        return (f"排序完成:\n"
                f"  数据: {self.sorted_data}\n"
                f"  比较次数: {self.comparisons}\n"
                f"  交换次数: {self.swaps}\n"
                f"  耗时: {self.time_elapsed:.6f}秒")


def bubble_sort[T: Comparable](
    data: MutableSequence[T],
    *,
    reverse: bool = False
) -> SortResult[T]:
    """
    现代化冒泡排序实现

    Args:
        data: 可变序列，支持泛型
        reverse: 是否逆序排序

    Returns:
        包含排序结果和统计信息的SortResult对象
    """
    start_time = time.perf_counter()
    comparisons = 0
    swaps = 0
    n = len(data)

    # 创建数据副本避免修改原数据
    sorted_data = list(data)

    for i in range(n):
        # 优化：如果某轮没有交换，则已排序完成
        swapped = False

        # 每轮将最大/最小元素冒泡到末尾
        for j in range(n - 1 - i):
            comparisons += 1

            # 根据reverse参数决定比较方向
            should_swap = (
                sorted_data[j] > sorted_data[j + 1] if not reverse
                else sorted_data[j] < sorted_data[j + 1]
            )

            if should_swap:
                sorted_data[j], sorted_data[j + 1] = sorted_data[j + 1], sorted_data[j]
                swaps += 1
                swapped = True

        # 提前退出优化
        if not swapped:
            break

    end_time = time.perf_counter()

    return SortResult(
        sorted_data=sorted_data,
        comparisons=comparisons,
        swaps=swaps,
        time_elapsed=end_time - start_time
    )


def bubble_sort_generator[T: Comparable](
    data: Sequence[T],
    *,
    reverse: bool = False
) -> tuple[list[T], int, int]:
    """
    生成器版本的冒泡排序，可以观察排序过程

    Yields:
        每次交换后的数组状态
    """
    sorted_data = list(data)
    n = len(sorted_data)
    comparisons = 0
    swaps = 0

    for i in range(n):
        swapped = False

        for j in range(n - 1 - i):
            comparisons += 1

            should_swap = (
                sorted_data[j] > sorted_data[j + 1] if not reverse
                else sorted_data[j] < sorted_data[j + 1]
            )

            if should_swap:
                sorted_data[j], sorted_data[j + 1] = sorted_data[j + 1], sorted_data[j]
                swaps += 1
                swapped = True
                yield sorted_data.copy(), comparisons, swaps

        if not swapped:
            break

    return sorted_data, comparisons, swaps


# 使用示例和测试
if __name__ == "__main__":
    # 测试整数排序
    print("=== 整数排序测试 ===")
    numbers = [64, 34, 25, 12, 22, 11, 90]
    print(f"原始数据: {numbers}")

    result = bubble_sort(numbers)
    print(result)

    # 测试逆序排序
    print("\n=== 逆序排序测试 ===")
    result_reverse = bubble_sort(numbers, reverse=True)
    print(result_reverse)

    # 测试字符串排序
    print("\n=== 字符串排序测试 ===")
    words = ["banana", "apple", "cherry", "date"]
    print(f"原始数据: {words}")

    word_result = bubble_sort(words)
    print(word_result)

    # 生成器版本演示
    print("\n=== 排序过程演示 ===")
    demo_data = [5, 2, 8, 1, 9]
    print(f"原始数据: {demo_data}")
    print("排序过程:")

    for step, (current_state, comps, swaps_count) in enumerate(
        bubble_sort_generator(demo_data), 1
    ):
        print(f"步骤 {step}: {current_state} (比较: {comps}, 交换: {swaps_count})")

    # 测试已排序数据（验证优化效果）
    print("\n=== 已排序数据测试 ===")
    sorted_data = [1, 2, 3, 4, 5]
    print(f"原始数据: {sorted_data}")

    sorted_result = bubble_sort(sorted_data)
    print(sorted_result)