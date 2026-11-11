// The home page's heading, greeting the user by first name.
import { useQuery } from "@tanstack/react-query";
import { profileQuery } from "../../lib/queries";
import styles from "./HomePage.module.scss";

/**
 * The page heading: "Hello <first name>!" once the profile holds a first
 * name, otherwise the generic welcome. It takes focus on navigation.
 */
export function Greeting() {
  const { data } = useQuery(profileQuery);
  const name = data && !data.partial ? data.first_name : "";
  return (
    <h1 tabIndex={-1} className={styles.greeting}>
      {name ? `Hello ${name}!` : "Hello and Welcome!"}
    </h1>
  );
}
