import styles from './CabinetBrand.module.css';

const BASE = import.meta.env.BASE_URL;

/** Те же файлы и подписи, что в шапке проблемомера (`app-shell/Header`). */
export function CabinetBrand() {
  return (
    <div className={styles.brand}>
      <img
        className={styles.stp}
        src={`${BASE}logo-stp.png`}
        alt="StP"
        width={40}
        height={40}
      />
      <img
        className={styles.mf}
        src={`${BASE}logo-multiframe.png`}
        alt="MultiFRAME"
        height={28}
      />
    </div>
  );
}
