"""
奇偶数检测脚本
使用现代Python特性实现多种奇偶数判断方法
"""

def is_odd_basic(n: int) -> bool:
    """
    基础方法：使用取模运算判断奇偶数

    Args:
        n: 要判断的整数

    Returns:
        True如果是奇数，False如果是偶数
    """
    return n % 2 != 0


def is_even_basic(n: int) -> bool:
    """
    基础方法：判断是否为偶数

    Args:
        n: 要判断的整数

    Returns:
        True如果是偶数，False如果是奇数
    """
    return n % 2 == 0


def is_odd_bitwise(n: int) -> bool:
    """
    位运算方法：使用位与运算判断奇偶数
    原理：奇数的二进制最后一位是1，偶数的二进制最后一位是0

    Args:
        n: 要判断的整数

    Returns:
        True如果是奇数，False如果是偶数
    """
    return n & 1 == 1


def is_even_bitwise(n: int) -> bool:
    """
    位运算方法：判断是否为偶数

    Args:
        n: 要判断的整数

    Returns:
        True如果是偶数，False如果是奇数
    """
    return n & 1 == 0


def is_odd_division(n: int) -> bool:
    """
    除法方法：使用整数除法判断奇偶数

    Args:
        n: 要判断的整数

    Returns:
        True如果是奇数，False如果是偶数
    """
    return n // 2 * 2 != n


def classify_number(n: int) -> str:
    """
    分类数字：返回数字的奇偶性描述

    Args:
        n: 要分类的整数

    Returns:
        描述字符串
    """
    if n == 0:
        return "零 (既不是奇数也不是偶数)"
    elif n % 2 == 0:
        return f"{n} 是偶数"
    else:
        return f"{n} 是奇数"


def batch_check_numbers(numbers: list[int]) -> dict[str, list[int]]:
    """
    批量检查数字奇偶性

    Args:
        numbers: 数字列表

    Returns:
        包含奇偶数分类的字典
    """
    result = {
        "odd_numbers": [],
        "even_numbers": [],
        "zeros": []
    }

    for num in numbers:
        if num == 0:
            result["zeros"].append(num)
        elif num % 2 == 0:
            result["even_numbers"].append(num)
        else:
            result["odd_numbers"].append(num)

    return result


def odd_even_stats(numbers: list[int]) -> dict[str, int]:
    """
    统计奇偶数数量

    Args:
        numbers: 数字列表

    Returns:
        统计结果字典
    """
    stats = {
        "total": len(numbers),
        "odd_count": 0,
        "even_count": 0,
        "zero_count": 0
    }

    for num in numbers:
        if num == 0:
            stats["zero_count"] += 1
        elif num % 2 == 0:
            stats["even_count"] += 1
        else:
            stats["odd_count"] += 1

    return stats


def main():
    """主函数：演示各种奇偶数检测方法"""
    print("=== Python奇偶数检测脚本 ===\n")

    # 测试数字
    test_numbers = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    print("测试数字列表:", test_numbers)
    print()

    # 方法1：基础取模方法演示
    print("=== 方法1：基础取模运算 ===")
    for num in test_numbers:
        odd_result = is_odd_basic(num)
        even_result = is_even_basic(num)
        print(f"{num:3}: 奇数? {odd_result:5} | 偶数? {even_result:5}")
    print()

    # 方法2：位运算方法演示
    print("=== 方法2：位运算 ===")
    for num in test_numbers:
        odd_result = is_odd_bitwise(num)
        even_result = is_even_bitwise(num)
        print(f"{num:3}: 奇数? {odd_result:5} | 偶数? {even_result:5}")
    print()

    # 方法3：除法方法演示
    print("=== 方法3：除法方法 ===")
    for num in test_numbers:
        odd_result = is_odd_division(num)
        print(f"{num:3}: 奇数? {odd_result}")
    print()

    # 分类演示
    print("=== 数字分类 ===")
    for num in test_numbers:
        print(classify_number(num))
    print()

    # 批量检查
    print("=== 批量检查 ===")
    batch_result = batch_check_numbers(test_numbers)
    print(f"奇数列表: {batch_result['odd_numbers']}")
    print(f"偶数列表: {batch_result['even_numbers']}")
    print(f"零列表:   {batch_result['zeros']}")
    print()

    # 统计信息
    print("=== 统计信息 ===")
    stats = odd_even_stats(test_numbers)
    print(f"总数: {stats['total']}")
    print(f"奇数数量: {stats['odd_count']}")
    print(f"偶数数量: {stats['even_count']}")
    print(f"零数量:   {stats['zero_count']}")
    print()

    # 用户交互
    print("=== 用户输入测试 ===")
    while True:
        try:
            user_input = input("请输入一个整数 (输入 'q' 退出): ")
            if user_input.lower() == 'q':
                break

            num = int(user_input)
            print(f"结果: {classify_number(num)}")
            print(f"  取模法 - 奇数? {is_odd_basic(num)}, 偶数? {is_even_basic(num)}")
            print(f"  位运算法 - 奇数? {is_odd_bitwise(num)}, 偶数? {is_even_bitwise(num)}")
            print(f"  除法法 - 奇数? {is_odd_division(num)}")
            print()

        except ValueError:
            print("输入无效，请输入一个整数！")
            print()


if __name__ == "__main__":
    main()