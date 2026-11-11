from hive.nectar.images import ImageRules


class TestImageRules:
    def test_community_hidden_until_search(self):
        r = ImageRules(["os_hash_algo", "os_hash_value", "os_hidden"])
        mine = {"visibility": "community", "owner": "p1"}
        theirs = {"visibility": "community", "owner": "p2"}
        public = {"visibility": "public", "owner": "p9"}
        assert r.visible_in_picker(mine, "p1", False)
        assert not r.visible_in_picker(theirs, "p1", False)
        assert r.visible_in_picker(theirs, "p1", True)
        assert r.visible_in_picker(public, "p1", False)

    def test_properties_strip_reserved_and_base(self):
        r = ImageRules(["os_hash_algo", "os_hash_value", "os_hidden"])
        image = {
            "id": "i",
            "name": "n",
            "os_hash_algo": "sha512",
            "os_distro": "ubuntu",
            "custom": "x",
        }
        assert r.properties(image) == {"os_distro": "ubuntu", "custom": "x"}
        summary = r.summary(image, "p1")
        assert summary["is_owner"] is False
        assert summary["properties"] == {"os_distro": "ubuntu", "custom": "x"}

    def test_custom_properties_exclude_reserved_and_base(self):
        r = ImageRules(["os_hidden"])
        assert r.is_custom_property("os_distro")
        assert not r.is_custom_property("os_hidden")
        assert not r.is_custom_property("direct_url")

    def test_name_map_prefers_earlier_groups(self):
        r = ImageRules([])
        names = r.name_map(
            [{"id": "a", "name": "mine"}],
            [{"id": "a", "name": "community copy"}, {"id": "b", "name": "b"}],
        )
        assert names == {"a": "mine", "b": "b"}
