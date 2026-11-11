from hive.devtools.cred import read_cred


def test_read_cred_parses_test_cred_files(tmp_path):
    cred = tmp_path / "test-cred"
    cred.write_text(
        "# rctest\n"
        'export OS_AUTH_URL="https://keystone.test:5000/v3/"\n'
        "OS_USERNAME=sam@example.edu\n"
        "export OS_PASSWORD='a b=c'\n"
        "export OS_EMPTY=\n"
        "not an assignment\n",
        encoding="utf-8",
    )
    assert read_cred(cred) == {
        "OS_AUTH_URL": "https://keystone.test:5000/v3/",
        "OS_USERNAME": "sam@example.edu",
        "OS_PASSWORD": "a b=c",
        "OS_EMPTY": "",
    }
