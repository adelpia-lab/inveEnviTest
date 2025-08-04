export async function HighTemperTest( ) {
    const dataVolt = [];
    const dataTemper=0;
    try {

        dataTemper = ReadChamber( );
        if( dataTemper > 75 && dataTemper < 70 ) {
            return false;
        }
        dataVolt = GetData( );

        return dataVolt;
    } catch (error) {
        return false;
    }
}
