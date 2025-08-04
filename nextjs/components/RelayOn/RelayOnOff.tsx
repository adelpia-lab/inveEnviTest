import { useContext } from "react";
import styles from "/styles/Home.module.css";

export default function RelayOnOff({relayNumber,onOff}){

    return (
    <div className={styles.toggle}>
        <label className={styles.toggle_switch}>
            <input 
            type="checkbox" 
            id={relayNumber}
            onChange={({ target: { checked } }) => onOff(checked,relayNumber)} />   <div></div>
        </label>
    </div>
    );
} 