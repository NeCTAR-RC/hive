from hive.auth.router import safe_next


def test_safe_next_only_accepts_relative_paths():
    assert safe_next("/compute/instances?x=1") == "/compute/instances?x=1"
    assert safe_next("https://evil.test/") == "/"
    assert safe_next("//evil.test/") == "/"
    assert safe_next("/auth/websso/") == "/"
    assert safe_next("/x\r\nSet-Cookie: a=b") == "/"
    assert safe_next("", default="/home") == "/home"
