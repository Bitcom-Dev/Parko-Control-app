import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { resize } from '../../../util/style';
import { purple, white } from '../../../util/colors';
import useMessage from '../../../util/messages';

const NotaConstatareScreen = () => {
	const { NotaConstatareScreen: strings } = useMessage();

	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: white }}>
			<MaterialIcons name="description" size={resize(80)} color={purple} />
			<Text style={{ marginTop: resize(20), fontSize: resize(18), color: purple }}>
				{strings?.title || 'Nota Constatare'}
			</Text>
			<Text style={{ marginTop: resize(10), fontSize: resize(12), color: '#999', textAlign: 'center', paddingHorizontal: resize(20) }}>
				{strings?.desc || 'Nota Constatare module - Coming soon'}
			</Text>
		</View>
	);
};

export default NotaConstatareScreen;
